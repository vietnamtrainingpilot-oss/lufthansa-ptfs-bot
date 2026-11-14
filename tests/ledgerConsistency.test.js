/**
 * ledgerConsistency.test.js — Transaction integrity and concurrency checks.
 *
 * Verifies the ledger's atomic exactly-once guarantees under concurrent and
 * adversarial conditions, plus the redemption stock/fulfil/refund safety.
 */
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { __setDbForTesting } from "../src/services/firestore.js";
import { CURRENCY, cloneDefaults } from "../src/config/loyaltyConfig.js";
import { applyLedgerEntry, TX_TYPE, readAccount, ensureAccount } from "../src/services/ledger.js";

/* ── In-memory Firestore double with real runTransaction ─────────────── */

const makeSnap = (doc) => ({ exists: doc !== undefined, data: () => doc, id: doc?.id });

function makeCollection(store, name) {
  const coll = {
    doc(id) {
      const k = `${name}/${id}`;
      return {
        __key: k,
        id,
        async get() { const d = store.get(k); return makeSnap(d ? { ...d, id } : undefined); },
        async set(data, opts = {}) {
          store.set(k, opts.merge && store.has(k) ? { ...store.get(k), ...data } : data);
        },
        async update(data) { store.set(k, { ...(store.get(k) || {}), ...data }); },
      };
    },
    where(field, op, value) {
      const hits = [];
      for (const [k, v] of store.entries()) {
        if (!k.startsWith(`${name}/`)) continue;
        if (op === "==" && v[field] === value) hits.push({ ...v, id: k.split("/")[1] });
        if (op === "!=" && v[field] !== value) hits.push({ ...v, id: k.split("/")[1] });
      }
      const wrap = (arr) => ({
        orderBy: () => wrap(arr),
        limit: () => wrap(arr),
        async get() {
          const docs = arr.map((d) => makeSnap(d));
          return { docs, size: docs.length, empty: docs.length === 0 };
        },
      });
      return wrap(hits);
    },
    async get() {
      const docs = [];
      for (const [k, v] of store.entries()) {
        if (k.startsWith(`${name}/`)) docs.push(makeSnap({ ...v, id: k.split("/")[1] }));
      }
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  };
  return coll;
}

const fakeDb = {
  store: new Map(),
  collection(name) { return makeCollection(this.store, name); },
  async runTransaction(fn) {
    const tx = {
      async get(ref) {
        const d = this._store.get(ref.__key);
        return makeSnap(d ? { ...d, id: ref.__key.split("/")[1] } : undefined);
      },
      async set(ref, data, opts = {}) {
        this._store.set(
          ref.__key,
          opts.merge && this._store.has(ref.__key) ? { ...this._store.get(ref.__key), ...data } : data
        );
      },
      update(ref, data) {
        this._store.set(ref.__key, { ...(this._store.get(ref.__key) || {}), ...data });
      },
      create(ref, data) {
        if (this._store.has(ref.__key)) {
          throw Object.assign(new Error("ALREADY_EXISTS"), { code: "ALREADY_EXISTS" });
        }
        this._store.set(ref.__key, data);
      },
      _store: null,
    };
    tx._store = this.store;
    return await fn(tx);
  },
};

let loyaltyStore;
const cfg = cloneDefaults();

before(async () => {
  __setDbForTesting(fakeDb);
  loyaltyStore = await import("../src/services/loyaltyStore.js");
  fakeDb.store.set("config/loyalty", { ...cfg });
  loyaltyStore.invalidateConfigCache();
});

beforeEach(() => {
  for (const k of [...fakeDb.store.keys()]) {
    if (
      k.startsWith("rewardsAccounts/") || k.startsWith("economyLedger/") ||
      k.startsWith("rewardAuditLog/") || k.startsWith("redemptions/") || k.startsWith("rewardsCatalog/")
    ) {
      fakeDb.store.delete(k);
    }
  }
  loyaltyStore.invalidateConfigCache();
});

/* ── Concurrent identical flight claims ─────────────────────────────── */

test("concurrent identical claims apply exactly once", async () => {
  const uid = "u-claim";
  await ensureAccount(uid);

  const key = "flight:dup:123:user";
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      applyLedgerEntry({
        userId: uid,
        currency: CURRENCY.POINTS,
        amount: 150,
        type: TX_TYPE.FLIGHT_EARN,
        reason: "concurrent",
        idempotencyKey: key,
      })
    )
  );

  const applied = results.filter((r) => r.status === "fulfilled" && r.value.applied === true).length;
  const duplicates = results.filter((r) => r.status === "fulfilled" && r.value.duplicate === true).length;
  const failed = results.filter((r) => r.status === "rejected").length;

  // The exactly-once guarantee: total credited must be exactly 150, never 750.
  // Real Firestore would retry a create-collision into a duplicate; our in-memory
  // double may surface ALREADY_EXISTS as a rejection. Either way, NO double-credit.
  assert.equal(applied, 1, "exactly one should apply");
  assert.ok(duplicates + failed <= 4, "the remaining four are duplicates or safe rejects");
  assert.equal(duplicates + failed, 4, "all four were deduplicated, none silently double-applied");

  const acc = await readAccount(uid);
  assert.equal(acc.balance, 150, "balance credited exactly once");
});

/* ── Insufficient balance ─────────────────────────────────────────────── */

test("overdraw is rejected and leaves no ledger entry", async () => {
  await ensureAccount("u-overdraw");
  fakeDb.store.set("rewardsAccounts/u-overdraw", { balance: 10, userId: "u-overdraw", credits: 0 });

  await assert.rejects(
    applyLedgerEntry({
      userId: "u-overdraw",
      currency: CURRENCY.POINTS,
      amount: -50,
      type: TX_TYPE.REDEMPTION,
      reason: "overdraw",
      idempotencyKey: "overdraw:key",
    }),
    /insufficient/
  );

  const ledgerKeys = [...fakeDb.store.keys()].filter((k) => k.startsWith("economyLedger/"));
  assert.equal(ledgerKeys.length, 0, "no ledger entry written on failure");
  const acc = await readAccount("u-overdraw");
  assert.equal(acc.balance, 10, "balance unchanged");
});

/* ── Duplicate refund prevention ─────────────────────────────────────── */

test("a redemption cannot be refunded twice", async () => {
  const { refundRedemption } = await import("../src/services/redemptions.js");
  await ensureAccount("u-refund");
  fakeDb.store.set("rewardsAccounts/u-refund", { balance: 100, userId: "u-refund", credits: 0 });
  fakeDb.store.set("redemptions/red1", {
    id: "red1", userId: "u-refund", rewardId: "r1",
    reward: { name: "Item", price: 100 }, status: "pending", milesDeducted: 100,
  });

  await refundRedemption({ redemptionId: "red1", reason: "first" });
  // Second refund must reject — status is now refunded
  await assert.rejects(
    refundRedemption({ redemptionId: "red1", reason: "dupe" }),
    /already refunded/
  );

  // And the ledger has exactly one refund entry
  const refundLedger = [...fakeDb.store.keys()].filter((k) =>
    k.startsWith("economyLedger/") && fakeDb.store.get(k).type === TX_TYPE.REFUND);
  assert.equal(refundLedger.length, 1, "only one refund entry");
});

/* ── Fulfil cannot be double-executed ───────────────────────────────── */

test("a redemption cannot be fulfilled twice", async () => {
  const { fulfillRedemption } = await import("../src/services/redemptions.js");
  fakeDb.store.set("redemptions/red2", {
    id: "red2", userId: "u2", rewardId: "r1",
    reward: { name: "Item", price: 50 }, status: "pending", milesDeducted: 50,
  });

  await fulfillRedemption({ redemptionId: "red2", fulfilledBy: "staff1" });
  await assert.rejects(
    fulfillRedemption({ redemptionId: "red2", fulfilledBy: "staff2" }),
    /already fulfilled/
  );
});