/**
 * missions.test.js — Mission claim atomicity and exactly-once tests.
 *
 * Runs against an in-memory Firestore double injected through the explicit
 * __setDbForTesting seam, so no live member balances are ever touched.
 *
 * The invariant under test: claiming a mission must credit the reward and
 * flip the claimed flag together. Marking claimed first in a separate
 * transaction permanently consumes the reward if the award then fails, which
 * leaves the member with a "claimed" mission and nothing credited.
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { __setDbForTesting } from "../src/services/firestore.js";
import { cloneDefaults } from "../src/config/loyaltyConfig.js";
import { invalidateConfigCache } from "../src/services/loyaltyStore.js";
import { claimMissionReward } from "../src/services/missions.js";

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
  return false;
};

function makeCollection(store, name) {
  const key = (id) => `${name}/${id}`;
  const coll = {
    __name: name,
    doc(id) {
      const k = key(id);
      return {
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
    },
    where(field, op, value) {
      return buildQuery([matcher(field, op, value)]);
    },
  };

  function buildQuery(filters) {
    const scan = () => {
      const out = [];
      for (const [k, v] of store.entries()) {
        if (!k.startsWith(`${name}/`)) continue;
        if (filters.every((f) => f(v))) out.push({ ...v, id: k.split("/")[1] });
      }
      return out;
    };
    return {
      where(field, op, value) {
        return buildQuery([...filters, matcher(field, op, value)]);
      },
      orderBy() {
        return this;
      },
      limit(n) {
        return {
          where: this.where,
          orderBy: this.orderBy,
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
  }

  return coll;
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
const MISSION = "m-001";

before(() => __setDbForTesting(fakeDb));
beforeEach(() => {
  fakeDb.store.clear();
  invalidateConfigCache();
  fakeDb.store.set("config/loyalty", cloneDefaults());
});

const account = () => fakeDb.store.get(`rewardsAccounts/${UID}`);
const progress = () => fakeDb.store.get(`missionProgress/${MISSION}_${UID}`);
const ledgerCount = () => [...fakeDb.store.keys()].filter((k) => k.startsWith("economyLedger/")).length;

function seedMission(over = {}) {
  fakeDb.store.set(`missions/${MISSION}`, {
    id: MISSION,
    title: "First Verified Flight",
    enabled: true,
    rewardCurrency: "points",
    rewardAmount: 250,
    ...over,
  });
}

function seedProgress(over = {}) {
  fakeDb.store.set(`missionProgress/${MISSION}_${UID}`, {
    userId: UID,
    missionId: MISSION,
    completed: true,
    claimed: false,
    progress: 1,
    ...over,
  });
}

/* ─── The happy path ───────────────────────────────────────────────────────── */

test("claiming a mission credits the reward and flips the flag", async () => {
  seedMission();
  seedProgress();
  fakeDb.store.set(`rewardsAccounts/${UID}`, { userId: UID, balance: 0, credits: 0 });

  await claimMissionReward({ userId: UID, missionId: MISSION });

  assert.equal(account().balance, 250, "the reward must be credited");
  assert.equal(progress().claimed, true, "the mission must be marked claimed");
  assert.equal(ledgerCount(), 1);
});

/* ─── Exactly-once ─────────────────────────────────────────────────────────── */

test("claiming twice does not credit twice", async () => {
  seedMission();
  seedProgress();
  fakeDb.store.set(`rewardsAccounts/${UID}`, { userId: UID, balance: 0, credits: 0 });

  await claimMissionReward({ userId: UID, missionId: MISSION });
  await assert.rejects(() => claimMissionReward({ userId: UID, missionId: MISSION }), /already claimed/i);

  assert.equal(account().balance, 250, "a double claim must credit only once");
  assert.equal(ledgerCount(), 1);
});

/* ─── A failed award must not consume the reward ───────────────────────────── */

test("when the award fails the mission is NOT left marked as claimed", async () => {
  // A reward above the ledger ceiling makes the award fail. The claim must
  // roll back with it rather than being silently consumed.
  seedMission({ rewardAmount: 1_000_000_000 });
  seedProgress();
  fakeDb.store.set(`rewardsAccounts/${UID}`, { userId: UID, balance: 0, credits: 0 });

  await assert.rejects(() => claimMissionReward({ userId: UID, missionId: MISSION }));

  assert.equal(
    progress().claimed,
    false,
    "a failed award must leave the mission claimable again, not silently eaten"
  );
  assert.equal(ledgerCount(), 0);
});

/* ─── Preconditions ────────────────────────────────────────────────────────── */

test("an incomplete mission cannot be claimed", async () => {
  seedMission();
  seedProgress({ completed: false });
  fakeDb.store.set(`rewardsAccounts/${UID}`, { userId: UID, balance: 0, credits: 0 });

  await assert.rejects(() => claimMissionReward({ userId: UID, missionId: MISSION }), /not completed/i);

  assert.equal(progress().claimed, false);
  assert.equal(account().balance, 0);
});

test("a disabled mission cannot be claimed", async () => {
  seedMission({ enabled: false });
  seedProgress();
  fakeDb.store.set(`rewardsAccounts/${UID}`, { userId: UID, balance: 0, credits: 0 });

  await assert.rejects(() => claimMissionReward({ userId: UID, missionId: MISSION }), /not currently active/i);

  assert.equal(progress().claimed, false);
});

test("an unknown mission is rejected", async () => {
  seedProgress();
  await assert.rejects(() => claimMissionReward({ userId: UID, missionId: "nope" }), /not found/i);
});

/* ─── Currency routing ─────────────────────────────────────────────────────── */

test("a credits mission credits credits, not points", async () => {
  seedMission({ rewardCurrency: "credits", rewardAmount: 40 });
  seedProgress();
  fakeDb.store.set(`rewardsAccounts/${UID}`, { userId: UID, balance: 100, credits: 0 });

  await claimMissionReward({ userId: UID, missionId: MISSION });

  assert.equal(account().credits, 40);
  assert.equal(account().balance, 100, "points must be untouched");
});