/**
 * ledger.test.js — Exactly-once, overdraw, and balance-isolation tests.
 *
 * These run against an in-memory Firestore double injected through the explicit
 * __setDbForTesting seam, so no live member balances are ever touched. The double
 * implements only what applyLedgerEntry needs: doc get/set/update/create, a
 * simple query surface, and a snapshotting runTransaction that rolls back on
 * throw so isolation is genuinely exercised.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { __setDbForTesting } from "../src/services/firestore.js";
import { CURRENCY } from "../src/config/loyaltyConfig.js";

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
  return {
    exists: doc !== undefined,
    data: () => doc,
    id: doc?.id,
  };
}

function makeCollection(store, name) {
  const key = (id) => `${name}/${id}`;

  const coll = {
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
          if (opts.merge && store.has(k)) {
            store.set(k, { ...store.get(k), ...clean });
          } else {
            store.set(k, clean);
          }
        },
        async update(data) {
          const cur = store.get(k) || {};
          store.set(k, { ...cur, ...materialise(data) });
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
      const matches = [];
      for (const [k, v] of store.entries()) {
        if (!k.startsWith(`${name}/`)) continue;
        if (op === "==") {
          if (v[field] === value) matches.push({ ...v, id: k.split("/")[1] });
        } else if (op === ">=") {
          const a = v[field];
          const b = resolveValue(value);
          if (a instanceof FakeTimestamp && b instanceof FakeTimestamp) {
            if (a.ms >= b.ms) matches.push({ ...v, id: k.split("/")[1] });
          } else if (a >= b) {
            matches.push({ ...v, id: k.split("/")[1] });
          }
        }
      }
      const wrap = (arr) => ({
        orderBy: () => wrap(arr),
        limit: () => wrap(arr),
        async get() {
          const docs = arr.map((d) => makeSnap(d));
          return { docs, size: docs.length, empty: docs.length === 0 };
        },
      });
      return wrap(matches);
    },
  };
  return coll;
}

function makeFakeDb() {
  const store = new Map();
  const db = {
    store,
    collection(name) {
      return makeCollection(store, name);
    },
    async runTransaction(fn) {
      // Snapshot for rollback so an aborted transaction leaves no partial writes.
      const backup = new Map([...store.entries()].map(([k, v]) => [k, { ...v }]));
      const tx = {
        async get(ref) {
          const d = store.get(ref.__key);
          return makeSnap(d ? { ...d, id: ref.__key.split("/")[1] } : undefined);
        },
        async set(ref, data, opts = {}) {
          const clean = materialise(data);
          if (opts.merge && store.has(ref.__key)) {
            store.set(ref.__key, { ...store.get(ref.__key), ...clean });
          } else {
            store.set(ref.__key, clean);
          }
        },
        update(ref, data) {
          const cur = store.get(ref.__key) || {};
          store.set(ref.__key, { ...cur, ...materialise(data) });
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
  return db;
}

const fakeDb = makeFakeDb();
let ledger;

before(async () => {
  __setDbForTesting(fakeDb);
  ledger = await import("../src/services/ledger.js");
});

after(() => {
  __setDbForTesting(null);
});

beforeEach(() => {
  fakeDb.store.clear();
});

const account = (id) => fakeDb.store.get(`rewardsAccounts/${id}`);

/* ─── Tests ────────────────────────────────────────────────────────────────── */

test("award creates the balance and exactly one ledger entry", async () => {
  const r = await ledger.applyLedgerEntry({
    userId: "u1", currency: CURRENCY.POINTS, amount: 100,
    type: "flightEarn", reason: "test", idempotencyKey: "k1",
  });
  assert.equal(r.applied, true);
  assert.equal(r.balance, 100);
  assert.equal(fakeDb.store.has("economyLedger/k1"), true);
});

test("duplicate idempotency key is a no-op and does not double-credit", async () => {
  await ledger.applyLedgerEntry({
    userId: "u1", currency: CURRENCY.POINTS, amount: 100,
    type: "flightEarn", reason: "t", idempotencyKey: "same",
  });
  const second = await ledger.applyLedgerEntry({
    userId: "u2", currency: CURRENCY.POINTS, amount: 100,
    type: "flightEarn", reason: "t", idempotencyKey: "same",
  });
  assert.equal(second.applied, false);
  assert.equal(second.duplicate, true);
  assert.equal(account("u2"), undefined, "second member must not be credited");
});

test("re-running flight finalization does not double-award", async () => {
  const key = "flight:F1:user1:points";
  await ledger.applyLedgerEntry({ userId: "user1", currency: CURRENCY.POINTS, amount: 120, type: "flightEarn", reason: "f", idempotencyKey: key });
  const rerun = await ledger.applyLedgerEntry({ userId: "user1", currency: CURRENCY.POINTS, amount: 120, type: "flightEarn", reason: "f", idempotencyKey: key });
  assert.equal(rerun.duplicate, true);
  assert.equal(account("user1").balance, 120);
});

test("a duplicated webhook retry cannot duplicate balances or ledger entries", async () => {
  const key = "flight:F2:user9:points";
  await ledger.applyLedgerEntry({ userId: "user9", currency: CURRENCY.POINTS, amount: 80, type: "flightEarn", reason: "f", idempotencyKey: key });
  await ledger.applyLedgerEntry({ userId: "user9", currency: CURRENCY.POINTS, amount: 80, type: "flightEarn", reason: "f", idempotencyKey: key });
  await ledger.applyLedgerEntry({ userId: "user9", currency: CURRENCY.POINTS, amount: 80, type: "flightEarn", reason: "f", idempotencyKey: key });

  const ledgerEntries = [...fakeDb.store.keys()].filter((k) => k.startsWith("economyLedger/"));
  assert.equal(ledgerEntries.length, 1, "exactly one ledger entry");
  assert.equal(account("user9").balance, 80);
});

test("points and credits are independent balances", async () => {
  await ledger.applyLedgerEntry({ userId: "u", currency: CURRENCY.POINTS, amount: 500, type: "x", reason: "", idempotencyKey: "p1" });
  await ledger.applyLedgerEntry({ userId: "u", currency: CURRENCY.CREDITS, amount: 40, type: "x", reason: "", idempotencyKey: "c1" });
  const acc = account("u");
  assert.equal(acc.balance, 500);
  assert.equal(acc.credits, 40);
});

test("normal debit cannot overdraw and leaves the balance untouched", async () => {
  await ledger.applyLedgerEntry({ userId: "u", currency: CURRENCY.POINTS, amount: 50, type: "x", reason: "", idempotencyKey: "a" });
  await assert.rejects(
    () => ledger.applyLedgerEntry({ userId: "u", currency: CURRENCY.POINTS, amount: -80, type: "x", reason: "", idempotencyKey: "b" }),
    (e) => e.code === "INSUFFICIENT_FUNDS"
  );
  assert.equal(account("u").balance, 50, "balance unchanged after rejected debit");
  assert.equal(fakeDb.store.has("economyLedger/b"), false, "no ledger entry on failure");
});

test("audited override may drive a balance negative", async () => {
  await ledger.applyLedgerEntry({ userId: "u", currency: CURRENCY.POINTS, amount: 10, type: "x", reason: "", idempotencyKey: "a" });
  const r = await ledger.applyLedgerEntry({
    userId: "u", currency: CURRENCY.POINTS, amount: -25, type: "staffDeduct",
    reason: "correction", idempotencyKey: "c", actorId: "staff", allowOverdraw: true,
  });
  assert.equal(r.balance, -15);
});

test("two concurrent redemptions cannot both spend the same balance", async () => {
  await ledger.applyLedgerEntry({ userId: "u", currency: CURRENCY.CREDITS, amount: 100, type: "x", reason: "", idempotencyKey: "seed" });

  const attempt = (key) =>
    ledger.applyLedgerEntry({
      userId: "u", currency: CURRENCY.CREDITS, amount: -80,
      type: "purchase", reason: "item", idempotencyKey: key,
    });

  await Promise.allSettled([attempt("buy1"), attempt("buy2")]);

  const acc = account("u");
  assert.ok(acc.credits >= 0, "balance must never go negative");
  assert.equal(acc.credits, 20, "only one of the two -80 debits applied");
});

test("spending points never reduces lifetime or qualifying metrics", async () => {
  await ledger.applyLedgerEntry({
    userId: "u", currency: CURRENCY.POINTS, amount: 200, type: "flightEarn",
    reason: "", idempotencyKey: "f1",
    lifetime: { pointsDelta: 200, qualifyingPointsDelta: 200, qualifyingFlightDelta: 1 },
  });
  let acc = account("u");
  assert.equal(acc.lifetimePointsEarned, 200);
  assert.equal(acc.qualifyingPoints, 200);
  assert.equal(acc.qualifyingFlightCount, 1);

  await ledger.applyLedgerEntry({
    userId: "u", currency: CURRENCY.POINTS, amount: -150, type: "redemption",
    reason: "", idempotencyKey: "r1",
  });
  acc = account("u");
  assert.equal(acc.balance, 50, "spendable decreased");
  assert.equal(acc.lifetimePointsEarned, 200, "lifetime preserved");
  assert.equal(acc.qualifyingPoints, 200, "qualifying preserved (tier safe)");
  assert.equal(acc.qualifyingFlightCount, 1);
});

test("ledger entry records before/after balances and metadata", async () => {
  await ledger.applyLedgerEntry({
    userId: "u", currency: CURRENCY.POINTS, amount: 60, type: "flightEarn",
    reason: "LH204", idempotencyKey: "k", referenceType: "flight", referenceId: "F204",
    metadata: { flightNumber: "LH204" },
  });
  const entry = fakeDb.store.get("economyLedger/k");
  assert.equal(entry.balanceBefore, 0);
  assert.equal(entry.balanceAfter, 60);
  assert.equal(entry.currency, "points");
  assert.equal(entry.referenceId, "F204");
  assert.equal(entry.metadata.flightNumber, "LH204");
});

test("missing idempotency key is rejected", async () => {
  await assert.rejects(
    () => ledger.applyLedgerEntry({ userId: "u", currency: CURRENCY.POINTS, amount: 1, type: "x", reason: "" }),
    /idempotencyKey is required/
  );
});

test("non-finite amount is rejected", async () => {
  await assert.rejects(
    () => ledger.applyLedgerEntry({ userId: "u", currency: CURRENCY.POINTS, amount: NaN, type: "x", reason: "", idempotencyKey: "k" }),
    /finite/
  );
});

test("unknown currency is rejected", async () => {
  await assert.rejects(
    () => ledger.applyLedgerEntry({ userId: "u", currency: "gold", amount: 1, type: "x", reason: "", idempotencyKey: "k" }),
    /unknown currency/
  );
});

test("balance ceiling is enforced", async () => {
  await assert.rejects(
    () => ledger.applyLedgerEntry({ userId: "u", currency: CURRENCY.POINTS, amount: 2e9, type: "x", reason: "", idempotencyKey: "big" }),
    (e) => e.code === "BALANCE_CEILING"
  );
});