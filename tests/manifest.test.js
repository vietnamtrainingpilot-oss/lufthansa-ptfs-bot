/**
 * manifest.test.js — Passenger manifest invariants.
 *
 * These run against an in-memory Firestore double injected through the explicit
 * __setDbForTesting seam, so no live flight manifest is ever touched.
 *
 * The invariant under test: `passengerIds` is always an exact, duplicate-free
 * mirror of `passengers[].userId`. The member dashboard queries that field with
 * `array-contains`, and Firestore cannot match a nested field inside an array
 * of objects, so a stale or missing mirror silently hides a member's entire
 * flight history.
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { __setDbForTesting } from "../src/services/firestore.js";
import manifest, { syncPassengerIdsForTest } from "../src/services/manifest.js";

/* ─── In-memory Firestore double ───────────────────────────────────────────── */

const serverTimestamp = () => ({ __ts: true });

function materialise(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) out[k] = v;
  return out;
}

function makeSnap(doc) {
  return { exists: doc !== undefined, data: () => doc, id: doc?.id };
}

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
  };
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
const FLIGHT = "flight-1";

before(() => __setDbForTesting(fakeDb));
beforeEach(() => fakeDb.store.clear());

const doc = () => fakeDb.store.get(`flightManifests/${FLIGHT}`);

/* ─── The mirror helper ────────────────────────────────────────────────────── */

test("syncPassengerIds extracts every userId and de-duplicates", () => {
  const ids = syncPassengerIdsForTest([
    { userId: "1" },
    { userId: "2" },
    { userId: "1" },
    { userId: null },
    null,
    {},
  ]);
  assert.deepEqual(ids.sort(), ["1", "2"]);
});

test("syncPassengerIds returns an empty list for no passengers", () => {
  assert.deepEqual(syncPassengerIdsForTest([]), []);
  assert.deepEqual(syncPassengerIdsForTest(null), []);
});

/* ─── The mirror stays in step with the manifest ───────────────────────────── */

test("adding a passenger writes a matching passengerIds mirror", async () => {
  await manifest.upsertPassenger(FLIGHT, { userId: "555", displayName: "Ann" });

  assert.deepEqual(doc().passengerIds, ["555"]);
  assert.equal(doc().passengers.length, 1);
});

test("a second passenger is appended to the mirror", async () => {
  await manifest.upsertPassenger(FLIGHT, { userId: "555" });
  await manifest.upsertPassenger(FLIGHT, { userId: "666" });

  assert.deepEqual(doc().passengerIds.sort(), ["555", "666"]);
});

test("re-upserting the same passenger does not duplicate the mirror entry", async () => {
  await manifest.upsertPassenger(FLIGHT, { userId: "555", cabinClass: "economy" });
  await manifest.upsertPassenger(FLIGHT, { userId: "555", cabinClass: "business" });

  assert.deepEqual(doc().passengerIds, ["555"], "one passenger, one mirror entry");
  assert.equal(doc().passengers.length, 1, "the passenger record is updated, not duplicated");
  assert.equal(doc().passengers[0].cabinClass, "business", "the latest edit wins");
});

test("the mirror never drifts from the passengers array after many edits", async () => {
  await manifest.upsertPassenger(FLIGHT, { userId: "1" });
  await manifest.upsertPassenger(FLIGHT, { userId: "2" });
  await manifest.upsertPassenger(FLIGHT, { userId: "3" });
  await manifest.upsertPassenger(FLIGHT, { userId: "1", seat: "12A" });

  const expected = [...new Set(doc().passengers.map((p) => String(p.userId)))];
  assert.deepEqual([...doc().passengerIds].sort(), expected.sort());
});

/* ─── The mirror is what the dashboard queries ─────────────────────────────── */

test("a member's id is findable in the mirror the dashboard queries", async () => {
  await manifest.upsertPassenger(FLIGHT, { userId: "777" });

  // Mirrors the memberRoutes query: where("passengerIds", "array-contains", id)
  assert.ok(doc().passengerIds.includes("777"));
});

test("a member who is not on the manifest is absent from the mirror", async () => {
  await manifest.upsertPassenger(FLIGHT, { userId: "777" });

  assert.equal(doc().passengerIds.includes("888"), false);
});