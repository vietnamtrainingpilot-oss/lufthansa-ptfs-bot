/**
 * catalogue.test.js — Redemption atomicity and exactly-once tests.
 *
 * Runs against an in-memory Firestore double injected through the explicit
 * __setDbForTesting seam, so no live member balances are ever touched.
 *
 * The central invariant under test: a redemption must move the member's
 * balance exactly once, and the balance change and its ledger entry must
 * commit together or not at all.
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { __setDbForTesting } from "../src/services/firestore.js";
import { cloneDefaults } from "../src/config/loyaltyConfig.js";
import { invalidateConfigCache } from "../src/services/loyaltyStore.js";
import catalogue from "../src/services/catalogue.js";

/* ─── In-memory Firestore double ───────────────────────────────────────────── */

class FakeTimestamp {
  constructor(ms) {
    this.ms = ms ?? Date.now();
  }
}
FakeTimestamp.fromDate = (d) => new FakeTimestamp(new Date(d).getTime());

const serverTimestamp = () => ({ __ts: true });

function resolveValue(v) {
  if (v && v.__ts) return new FakeTimestamp();
  if (v instanceof FakeTimestamp) return v;
  return v;
}

function materialise(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) out[k] = resolveValue(v);
  return out;
}

function makeSnap(doc) {
  return { exists: doc !== undefined, data: () => doc, id: doc?.id };
}

const matcher = (field, op, value) => (v) => {
  if (op === "==") return v[field] === value;
  if (op === ">=") {
    const b = resolveValue(value);
    if (v[field] instanceof FakeTimestamp && b instanceof FakeTimestamp) return v[field].ms >= b.ms;
    return v[field] >= b;
  }
  if (op === "array-contains") return Array.isArray(v[field]) && v[field].some((x) => String(x) === String(value));
  return false;
};

function makeCollection(store, name) {
  const key = (id) => `${name}/${id}`;

  return {
    __name: name,
    doc(id) {
      const k = key(id);
      const ref = {
        __key: k,
        id,
        async get() {
          const d = store.get(k);
          return makeSnap(d ? { ...d, id } : undefined);
        },
        async set(data, opts = {}) {
          const clean = materialise(data);
          if (opts.merge && store.has(k)) store.set(k, { ...store.get(k), ...clean });
          else store.set(k, clean);
        },
        async update(data) {
          store.set(k, { ...(store.get(k) || {}), ...materialise(data) });
        },
        async create(data) {
          if (store.has(k)) {
            const e = new Error("ALREADY_EXISTS");
            e.code = "ALREADY_EXISTS";
            throw e;
          }
          store.set(k, materialise(data));
        },
      };
      return ref;
    },
    where(field, op, value) {
      return buildQuery([matcher(field, op, value)]);
    },
  };

  // Chained filters intersect, matching Firestore's conjunctive semantics.
  // `filters` is an array of predicates; rows are only materialised on get().
  function buildQuery(filters) {
    const scan = () => {
      const out = [];
      for (const [k, v] of store.entries()) {
        if (!k.startsWith(`${name}/`)) continue;
        if (filters.every((f) => f(v))) out.push({ ...v, id: k.split("/")[1] });
      }
      return out;
    };

    let rows = null;

    const wrap = {
      where(field, op, value) {
        return buildQuery([...filters, matcher(field, op, value)]);
      },
      orderBy() {
        return wrap;
      },
      limit(n) {
        const base = wrap;
        return {
          ...base,
          where: base.where,
          orderBy: base.orderBy,
          async get() {
            const docs = scan().slice(0, n).map((d) => makeSnap(d));
            return { docs, size: docs.length, empty: docs.length === 0 };
          },
        };
      },
      async get() {
        const docs = scan().map((d) => makeSnap(d));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };

    void rows;
    return wrap;
  }
}

function makeFakeDb() {
  const store = new Map();
  return {
    store,
    collection(name) {
      return makeCollection(store, name);
    },
    async runTransaction(fn) {
      const backup = new Map([...store.entries()].map(([k, v]) => [k, { ...v }]));
      const tx = {
        async get(ref) {
          const d = store.get(ref.__key);
          return makeSnap(d ? { ...d, id: ref.__key.split("/")[1] } : undefined);
        },
        async set(ref, data, opts = {}) {
          const clean = materialise(data);
          if (opts.merge && store.has(ref.__key)) store.set(ref.__key, { ...store.get(ref.__key), ...clean });
          else store.set(ref.__key, clean);
        },
        update(ref, data) {
          store.set(ref.__key, { ...(store.get(ref.__key) || {}), ...materialise(data) });
        },
        create(ref, data) {
          if (store.has(ref.__key)) {
            const e = new Error("ALREADY_EXISTS");
            e.code = "ALREADY_EXISTS";
            throw e;
          }
          store.set(ref.__key, materialise(data));
        },
      };
      try {
        return await fn(tx);
      } catch (e) {
        store.clear();
        for (const [k, v] of backup) store.set(k, v);
        throw e;
      }
    },
  };
}

const fakeDb = makeFakeDb();
const UID = "111222333444555666";

before(() => __setDbForTesting(fakeDb));
beforeEach(() => {
  fakeDb.store.clear();
  invalidateConfigCache();
  fakeDb.store.set("config/loyalty", cloneDefaults());
});

const account = () => fakeDb.store.get(`rewardsAccounts/${UID}`);
const ledgerEntries = () => [...fakeDb.store.entries()].filter(([k]) => k.startsWith("economyLedger/"));

function seedAccount(over = {}) {
  fakeDb.store.set(`rewardsAccounts/${UID}`, { userId: UID, balance: 0, credits: 0, ...over });
}

function seedItem(over = {}) {
  fakeDb.store.set("catalogueItems/seat", {
    id: "seat",
    displayName: "Window Seat Upgrade",
    description: "Pick your seat",
    currency: "points",
    price: 100,
    active: true,
    stock: 5,
    fulfillment: "staff_queue",
    ...over,
  });
}

/* ─── The invariant ────────────────────────────────────────────────────────── */

test("redeeming a 100-point item deducts exactly 100, not 200", async () => {
  seedAccount({ balance: 1000 });
  seedItem();

  await catalogue.transactItem({ userId: UID, itemId: "seat", idempotencyKey: "tx-double-charge" });

  assert.equal(account().balance, 900, "balance must fall by exactly the item price");
});

test("the ledger records a single matching debit", async () => {
  seedAccount({ balance: 1000 });
  seedItem();

  await catalogue.transactItem({ userId: UID, itemId: "seat", idempotencyKey: "tx-ledger" });

  const entries = ledgerEntries();
  assert.equal(entries.length, 1, "exactly one ledger entry");
  const entry = entries[0][1];
  assert.equal(entry.amount, -100);
  assert.equal(entry.balanceBefore, 1000);
  assert.equal(entry.balanceAfter, 900);
});

test("ledger after-value always agrees with the stored account balance", async () => {
  seedAccount({ balance: 1000 });
  seedItem();

  await catalogue.transactItem({ userId: UID, itemId: "seat", idempotencyKey: "tx-agree" });

  const entry = ledgerEntries()[0][1];
  assert.equal(entry.balanceAfter, account().balance, "ledger and account must never drift");
});

test("a full-balance redemption succeeds without losing the whole balance", async () => {
  seedAccount({ balance: 100 });
  seedItem();

  await catalogue.transactItem({ userId: UID, itemId: "seat", idempotencyKey: "tx-exact" });

  assert.equal(account().balance, 0, "spending the exact balance must leave zero, not fail");
});

test("stock is decremented once", async () => {
  seedAccount({ balance: 1000 });
  seedItem({ stock: 5 });

  await catalogue.transactItem({ userId: UID, itemId: "seat", idempotencyKey: "tx-stock" });

  assert.equal(fakeDb.store.get("catalogueItems/seat").stock, 4);
});

/* ─── Exactly-once ─────────────────────────────────────────────────────────── */

test("retrying the same idempotency key does not charge twice", async () => {
  seedAccount({ balance: 1000 });
  seedItem();

  await catalogue.transactItem({ userId: UID, itemId: "seat", idempotencyKey: "tx-retry" });
  await catalogue.transactItem({ userId: UID, itemId: "seat", idempotencyKey: "tx-retry" });

  assert.equal(account().balance, 900, "a retry must be a no-op");
  assert.equal(ledgerEntries().length, 1, "a retry must not add a ledger entry");
  assert.equal(fakeDb.store.get("catalogueItems/seat").stock, 4, "a retry must not consume stock");
});

/* ─── Failure leaves no trace ──────────────────────────────────────────────── */

test("an insufficient balance charges nothing and leaves no ledger entry", async () => {
  seedAccount({ balance: 50 });
  seedItem({ price: 100 });

  await assert.rejects(
    () => catalogue.transactItem({ userId: UID, itemId: "seat", idempotencyKey: "tx-poor" }),
    /insufficient/i
  );

  assert.equal(account().balance, 50, "balance must be untouched");
  assert.equal(ledgerEntries().length, 0, "no ledger entry on failure");
  assert.equal(fakeDb.store.get("catalogueItems/seat").stock, 5, "stock must be untouched");
  assert.equal(fakeDb.store.has("redemptions/tx-poor"), false, "no redemption record on failure");
});

test("an out-of-stock item charges nothing", async () => {
  seedAccount({ balance: 1000 });
  seedItem({ stock: 0 });

  await assert.rejects(
    () => catalogue.transactItem({ userId: UID, itemId: "seat", idempotencyKey: "tx-nostock" }),
    /out of stock/i
  );

  assert.equal(account().balance, 1000);
  assert.equal(ledgerEntries().length, 0);
});

test("credits purchases debit credits, not points", async () => {
  seedAccount({ balance: 1000, credits: 300 });
  seedItem({ currency: "credits", price: 250 });

  await catalogue.transactItem({ userId: UID, itemId: "seat", idempotencyKey: "tx-credits" });

  assert.equal(account().balance, 1000, "points must be untouched");
  assert.equal(account().credits, 50, "credits must fall by the price");
});

/* ─── Tier gate ────────────────────────────────────────────────────────────── */

test("a tier-gated item rejects a member below the required tier", async () => {
  seedAccount({ balance: 100000, qualifyingPoints: 0 });
  seedItem({ price: 100, eligibility: { minTierKey: "elite" } });

  await assert.rejects(
    () => catalogue.transactItem({ userId: UID, itemId: "seat", idempotencyKey: "tx-tier" }),
    /elite/i
  );

  assert.equal(account().balance, 100000, "a rejected redemption must not charge");
  assert.equal(ledgerEntries().length, 0);
});