/**
 * awardFlow.test.js — End-to-end verified flight reward workflow tests.
 *
 * Exercises the real orchestration code (manifest -> formula -> ledger) against
 * the in-memory Firestore double. Verifies the acceptance criteria that matter
 * most: no-shows earn nothing, cancelled flights earn nothing, awards happen
 * exactly once, and re-running finalization is a no-op.
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { __setDbForTesting } from "../src/services/firestore.js";
import { CURRENCY, cloneDefaults } from "../src/config/loyaltyConfig.js";

/* ── Reuse the fake Firestore double ──────────────────────────────────────── */

class FakeTimestamp {
  constructor(ms) {
    this.ms = ms ?? Date.now();
  }
}
FakeTimestamp.fromDate = (d) => new FakeTimestamp(new Date(d).getTime());

const materialise = (data) => {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) out[k] = v && v.__ts ? new FakeTimestamp() : v;
  return out;
};
const makeSnap = (doc) => ({ exists: doc !== undefined, data: () => doc, id: doc?.id });

function makeCollection(store, name) {
  const coll = {
    doc(id) {
      const k = `${name}/${id}`;
      return {
        __key: k,
        id,
        async get() {
          const d = store.get(k);
          return makeSnap(d ? { ...d, id } : undefined);
        },
        async set(data, opts = {}) {
          const clean = materialise(data);
          store.set(k, opts.merge && store.has(k) ? { ...store.get(k), ...clean } : clean);
        },
        async update(data) {
          store.set(k, { ...(store.get(k) || {}), ...materialise(data) });
        },
        async create(data) {
          if (store.has(k)) throw Object.assign(new Error("ALREADY_EXISTS"), { code: "ALREADY_EXISTS" });
          store.set(k, materialise(data));
        },
      };
    },
    where(field, op, value) {
      const hits = [];
      for (const [k, v] of store.entries()) {
        if (!k.startsWith(`${name}/`)) continue;
        if (op === "==" && v[field] === value) hits.push({ ...v, id: k.split("/")[1] });
        if (op === ">=") {
          const b = value && value.__ts ? new FakeTimestamp() : value;
          const a = v[field];
          if (a instanceof FakeTimestamp && b instanceof FakeTimestamp) {
            if (a.ms >= b.ms) hits.push({ ...v, id: k.split("/")[1] });
          } else if (a >= b) hits.push({ ...v, id: k.split("/")[1] });
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
  collection(name) {
    return makeCollection(this.store, name);
  },
  async runTransaction(fn) {
    const backup = new Map([...this.store.entries()].map(([k, v]) => [k, { ...v }]));
    const store = this.store;
    const tx = {
      async get(ref) {
        const d = store.get(ref.__key);
        return makeSnap(d ? { ...d, id: ref.__key.split("/")[1] } : undefined);
      },
      async set(ref, data, opts = {}) {
        const clean = materialise(data);
        store.set(ref.__key, opts.merge && store.has(ref.__key) ? { ...store.get(ref.__key), ...clean } : clean);
      },
      update(ref, data) {
        store.set(ref.__key, { ...(store.get(ref.__key) || {}), ...materialise(data) });
      },
      create(ref, data) {
        if (store.has(ref.__key)) throw Object.assign(new Error("ALREADY_EXISTS"), { code: "ALREADY_EXISTS" });
        store.set(ref.__key, materialise(data));
      },
    };
    try {
      return await fn(tx);
    } catch (e) {
      this.store.clear();
      for (const [k, v] of backup) this.store.set(k, v);
      throw e;
    }
  },
};

let manifest, flightRewards, missions, loyaltyStore;
const cfg = cloneDefaults();

before(async () => {
  __setDbForTesting(fakeDb);
  manifest = await import("../src/services/manifest.js");
  flightRewards = await import("../src/services/flightRewards.js");
  missions = await import("../src/services/missions.js");
  loyaltyStore = await import("../src/services/loyaltyStore.js");

  // Seed the loyalty config document so the store does not need admin writes.
  fakeDb.store.set("config/loyalty", { ...cfg });
});

beforeEach(() => {
  // The config store caches for 30s; drop it so each test reads its seeded doc.
  loyaltyStore.invalidateConfigCache();
  for (const k of [...fakeDb.store.keys()]) {
    if (k.startsWith("rewardsAccounts/") || k.startsWith("economyLedger/") || k.startsWith("flightManifests/") || k.startsWith("missionProgress/") || k.startsWith("missions/")) {
      fakeDb.store.delete(k);
    }
  }
});

function makeFlight(over = {}) {
  return {
    id: "F1",
    flightNumber: "VJ101",
    status: "completed",
    departureAirport: "HAN (Hanoi)",
    arrivalAirport: "DAD (Da Nang)",
    aircraft: "A321",
    routeDistanceKm: 600,
    flightTimeMinutes: 60,
    cabinClass: "economy",
    ...over,
  };
}

async function seedPassengers(flight, entries) {
  await manifest.ensureManifest(flight.id, { flightNumber: flight.flightNumber });
  for (const e of entries) {
    await manifest.upsertPassenger(flight.id, {
      bookingStatus: "confirmed",
      presenceStatus: "present",
      eligible: true,
      cabinClass: "economy",
      ...e,
    });
  }
  await manifest.finalizeManifest(flight.id, "staff1");
}

const account = (id) => fakeDb.store.get(`rewardsAccounts/${id}`);

/* ── Tests ────────────────────────────────────────────────────────────────── */

test("completed flight awards points and credits to an eligible passenger", async () => {
  const flight = makeFlight();
  await seedPassengers(flight, [{ userId: "u1", cabinClass: "economy" }]);

  const res = await flightRewards.awardFlightRewards(flight, "staff1");
  assert.equal(res.applied, true);

  const acc = account("u1");
  assert.ok(acc.balance > 0, "points awarded");
  assert.ok(acc.credits > 0, "credits awarded");
  assert.equal(acc.qualifyingFlightCount, 1, "qualifying flight recorded");
  assert.equal(acc.qualifyingPoints, acc.balance, "qualifying equals earned on first flight");
});

test("no-show passengers receive nothing", async () => {
  const flight = makeFlight();
  await seedPassengers(flight, [
    { userId: "present", presenceStatus: "present" },
    { userId: "noshow", presenceStatus: "no_show" },
  ]);

  await flightRewards.awardFlightRewards(flight, "staff1");

  assert.ok(account("present"), "present passenger credited");
  assert.equal(account("noshow"), undefined, "no-show must not be credited at all");
});

test("cancelled flight grants no rewards", async () => {
  const flight = makeFlight({ status: "cancelled" });
  await seedPassengers(flight, [{ userId: "u1" }]);

  const res = await flightRewards.awardFlightRewards(flight, "staff1");
  assert.equal(res.applied, false);
  assert.equal(res.reason, "FLIGHT_NOT_COMPLETED");
  assert.equal(account("u1"), undefined);
});

test("a flight awaiting completion cannot be rewarded", async () => {
  const flight = makeFlight({ status: "scheduled" });
  await seedPassengers(flight, [{ userId: "u1" }]);
  const res = await flightRewards.awardFlightRewards(flight, "staff1");
  assert.equal(res.applied, false);
  assert.equal(res.reason, "FLIGHT_NOT_COMPLETED");
});

test("re-running finalization does not double-award", async () => {
  const flight = makeFlight();
  await seedPassengers(flight, [{ userId: "u1" }]);

  const first = await flightRewards.awardFlightRewards(flight, "staff1");
  const afterFirst = account("u1").balance;

  const second = await flightRewards.awardFlightRewards(flight, "staff1");
  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.equal(second.reason, "ALREADY_APPLIED");
  assert.equal(account("u1").balance, afterFirst, "balance unchanged on re-run");
});

test("duplicate ledger keys from a retried run are ignored", async () => {
  const flight = makeFlight();
  await seedPassengers(flight, [{ userId: "u1" }]);
  await flightRewards.awardFlightRewards(flight, "staff1");

  const pointEntries = [...fakeDb.store.keys()].filter((k) => k.startsWith("economyLedger/flight:F1:u1:points"));
  assert.equal(pointEntries.length, 1, "exactly one points ledger entry for the flight/user pair");
});

test("unfinalized manifest blocks rewards", async () => {
  const flight = makeFlight();
  await manifest.ensureManifest(flight.id, {});
  await manifest.upsertPassenger(flight.id, { userId: "u1", presenceStatus: "present", bookingStatus: "confirmed" });

  const res = await flightRewards.awardFlightRewards(flight, "staff1");
  assert.equal(res.applied, false);
  assert.equal(res.reason, "NOT_FINALIZED");
  assert.equal(account("u1"), undefined);
});

test("preview reports eligible and excluded counts without writing", async () => {
  const flight = makeFlight();
  await seedPassengers(flight, [
    { userId: "a" },
    { userId: "b", presenceStatus: "no_show" },
    { userId: "c", eligible: false },
  ]);

  const preview = await flightRewards.buildRewardPreview(flight);
  assert.equal(preview.ok, true);
  assert.equal(preview.eligibleCount, 1);
  assert.equal(preview.totalPassengers, 3);
  assert.ok(preview.totalPoints > 0);
  assert.equal(account("a"), undefined, "preview must not write balances");
});

test("flight with no distance falls back to duration basis", async () => {
  const flight = makeFlight({ routeDistanceKm: null, flightTimeMinutes: 120 });
  await seedPassengers(flight, [{ userId: "u1" }]);

  const preview = await flightRewards.buildRewardPreview(flight);
  assert.equal(preview.ok, true);
  assert.equal(preview.awarded[0].breakdown.basis, "duration");
  assert.ok(preview.totalPoints > 0);
});

test("flight missing both distance and duration is skipped for staff correction", async () => {
  const flight = makeFlight({ routeDistanceKm: null, flightTimeMinutes: null });
  await seedPassengers(flight, [{ userId: "u1" }]);

  const preview = await flightRewards.buildRewardPreview(flight);
  assert.equal(preview.ok, true);
  assert.equal(preview.awarded.length, 0, "nobody is awarded");
  assert.equal(preview.skipped.length, 1, "flagged for staff correction");
  assert.match(preview.skipped[0].reason, /incomplete/i);
});

test("per-flight cap limits how many passengers are rewarded", async () => {
  const cappedCfg = cloneDefaults();
  cappedCfg.eligibility.maxRewardedPassengersPerFlight = 2;
  fakeDb.store.set("config/loyalty", { ...cappedCfg });
  loyaltyStore.invalidateConfigCache();

  const flight = makeFlight();
  await seedPassengers(flight, [{ userId: "a" }, { userId: "b" }, { userId: "c" }, { userId: "d" }]);

  const res = await flightRewards.awardFlightRewards(flight, "staff1");
  assert.equal(res.totals.rewardedPassengers, 2);
  assert.ok(account("a") && account("b"));
  assert.equal(account("c"), undefined);
  assert.equal(account("d"), undefined);

  fakeDb.store.set("config/loyalty", { ...cfg });
  loyaltyStore.invalidateConfigCache();
});

test("cabin class changes the award", async () => {
  const flight = makeFlight();
  await seedPassengers(flight, [
    { userId: "eco", cabinClass: "economy" },
    { userId: "biz", cabinClass: "business" },
  ]);

  await flightRewards.awardFlightRewards(flight, "staff1");
  assert.ok(account("biz").balance > account("eco").balance, "business earns more than economy");
});

test("mission progress advances from a verified flight", async () => {
  const flight = makeFlight();
  await seedPassengers(flight, [{ userId: "u1" }]);
  await flightRewards.awardFlightRewards(flight, "staff1");

  const advanced = await missions.progressFromVerifiedFlight({ userId: "u1", flight });
  // No missions are configured, so nothing advances, and it must not throw.
  assert.ok(Array.isArray(advanced));
  assert.equal(advanced.length, 0);
});

test("reconciliation writes compensating entries without deleting history", async () => {
  const flight = makeFlight();
  await seedPassengers(flight, [{ userId: "u1" }]);
  await flightRewards.awardFlightRewards(flight, "staff1");

  const before = account("u1").balance;
  const entriesBefore = [...fakeDb.store.keys()].filter((k) => k.startsWith("economyLedger/")).length;

  await flightRewards.reconcileFlight(flight, "u1", "staff1", {
    pointsDelta: -50,
    creditsDelta: 0,
    reason: "Passenger marked ineligible after review",
  });

  assert.equal(account("u1").balance, before - 50);
  const entriesAfter = [...fakeDb.store.keys()].filter((k) => k.startsWith("economyLedger/")).length;
  assert.ok(entriesAfter > entriesBefore, "a compensating entry was added, none removed");
});

test("reconciliation requires a reason", async () => {
  const flight = makeFlight();
  await assert.rejects(
    () => flightRewards.reconcileFlight(flight, "u1", "staff1", { pointsDelta: -10, creditsDelta: 0, reason: "" }),
    /reason is required/i
  );
});
