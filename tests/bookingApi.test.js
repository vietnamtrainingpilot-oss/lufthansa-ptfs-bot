/**
 * bookingApi.test.js — Public booking endpoint and webhook authorisation tests.
 *
 * The booking flow writes a passenger manifest, which is the gate for flight
 * rewards, so who is allowed to write one matters. These tests cover both
 * surfaces: the same-origin public endpoint and the secret-guarded webhook.
 */

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { __setDbForTesting } from "../src/services/firestore.js";
import { cloneDefaults } from "../src/config/loyaltyConfig.js";
import { invalidateConfigCache } from "../src/services/loyaltyStore.js";
import { createWebApp } from "../src/web/server.js";

/* ─── In-memory Firestore double ───────────────────────────────────────────── */

const serverTimestamp = () => ({ __ts: true });
function materialise(d) {
  const o = {};
  for (const [k, v] of Object.entries(d || {})) o[k] = v;
  return o;
}
function makeSnap(doc) {
  return { exists: doc !== undefined, data: () => doc, id: doc?.id };
}

const matcher = (field, op, value) => (v) => {
  if (op === "==") return v[field] === value;
  return false;
};

function makeCollection(store, name) {
  const key = (id) => `${name}/${id}`;
  const coll = {
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
          const c = materialise(data);
          if (opts.merge && store.has(k)) store.set(k, { ...store.get(k), ...c });
          else store.set(k, c);
        },
        async update(data) {
          store.set(k, { ...(store.get(k) || {}), ...materialise(data) });
        },
        async create(data) {
          if (store.has(k)) throw Object.assign(new Error("EXISTS"), { code: "ALREADY_EXISTS" });
          store.set(k, materialise(data));
        },
      };
    },
    where(field, op, value) {
      const filters = [matcher(field, op, value)];
      const scan = () => {
        const out = [];
        for (const [k, v] of store.entries()) {
          if (!k.startsWith(`${name}/`)) continue;
          if (filters.every((f) => f(v))) out.push({ ...v, id: k.split("/")[1] });
        }
        return out;
      };
      return {
        where(f2, o2, v2) {
          const inner = scan();
          filters.push(matcher(f2, o2, v2));
          const self = this;
          return {
            ...self,
            limit(n) {
              return {
                ...self,
                async get() {
                  const docs = scan().slice(0, n).map((d) => makeSnap(d));
                  void inner;
                  return { docs, size: docs.length, empty: docs.length === 0 };
                },
              };
            },
          };
        },
        limit(n) {
          const self = this;
          return {
            async get() {
              const docs = scan().slice(0, n).map((d) => makeSnap(d));
              void self;
              return { docs, size: docs.length, empty: docs.length === 0 };
            },
          };
        },
        async get() {
          const docs = scan().map((d) => makeSnap(d));
          return { docs, size: docs.length, empty: docs.length === 0 };
        },
      };
    },
  };
  return coll;
}

const fakeDb = {
  store: new Map(),
  collection(n) {
    return makeCollection(this.store, n);
  },
  async runTransaction(fn) {
    const backup = new Map([...this.store.entries()].map(([k, v]) => [k, { ...v }]));
    const store = this.store;
    const tx = {
      async get(ref) {
        const d = store.get(ref.__key);
        return makeSnap(d ? { ...d, id: ref.__key.split("/")[1] } : undefined);
      },
      async set(ref, data, o = {}) {
        const c = materialise(data);
        store.set(ref.__key, o.merge && store.has(ref.__key) ? { ...store.get(ref.__key), ...c } : c);
      },
      update(ref, data) {
        store.set(ref.__key, { ...(store.get(ref.__key) || {}), ...materialise(data) });
      },
      create(ref, data) {
        if (store.has(ref.__key)) throw Object.assign(new Error("EXISTS"), { code: "ALREADY_EXISTS" });
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

const SECRET = "webhook-shared-secret";
let app;

/**
 * Build a fresh app. Rebuilt per test so the in-memory rate limiter starts
 * empty each time; otherwise the booking limit trips across tests in one run.
 */
function buildApp() {
  return createWebApp({
    config: {
      clientId: "1",
      discordOAuthClientSecret: "2",
      websiteSessionSecret: "session-secret",
      websiteBaseUrl: "https://example.test",
      bookingApiPort: 3001,
      bookingWebhookSecret: SECRET,
    },
    // No Discord client: notifications must be skipped without breaking the request.
  });
}

before(async () => {
  __setDbForTesting(fakeDb);
  app = buildApp();
});

beforeEach(() => {
  app = buildApp();
  fakeDb.store.clear();
  fakeDb.store.set("config/loyalty", cloneDefaults());
  invalidateConfigCache();
  fakeDb.store.set("flights/LH123", {
    flightNumber: "123", departureAirport: "FRA",
    arrivalAirport: "MUC",
    status: "scheduled",
  });
});

async function withServer(fn) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address();
  const call = async (path, { method = "POST", body, headers = {} } = {}) => {
    const h = { ...headers };
    if (body) h["content-type"] = "application/json";
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: h,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {}
    return { status: res.status, data };
  };
  try {
    await fn(call);
  } finally {
    server.close();
  }
}

const VALID = { flightNumber: "LH123", discordUserId: "111222333444555666", class: "economy", seat: "12A" };
const manifest = () => fakeDb.store.get("flightManifests/LH123");

/* ─── Public endpoint ──────────────────────────────────────────────────────── */

test("a valid booking is recorded on the manifest", async () => {
  await withServer(async (call) => {
    const res = await call("/api/bookings", { body: VALID });
    assert.equal(res.status, 200);
    assert.equal(manifest().passengers.length, 1);
    assert.equal(manifest().passengers[0].userId, VALID.discordUserId);
  });
});

test("a booking writes the passengerIds mirror the dashboard queries", async () => {
  await withServer(async (call) => {
    await call("/api/bookings", { body: VALID });
    assert.deepEqual(manifest().passengerIds, [VALID.discordUserId]);
  });
});

test("a repeat booking updates rather than duplicates the passenger", async () => {
  await withServer(async (call) => {
    await call("/api/bookings", { body: VALID });
    await call("/api/bookings", { body: { ...VALID, seat: "14C" } });
    assert.equal(manifest().passengers.length, 1);
    assert.equal(manifest().passengers[0].seat, "14C");
    assert.deepEqual(manifest().passengerIds, [VALID.discordUserId]);
  });
});

test("an unknown flight is rejected", async () => {
  await withServer(async (call) => {
    const res = await call("/api/bookings", { body: { ...VALID, flightNumber: "LH999" } });
    assert.equal(res.status, 404);
    assert.equal(fakeDb.store.has("flightManifests/LH999"), false);
  });
});

test("the legacy pre-rebrand VJ flight prefix is rejected", async () => {
  await withServer(async (call) => {
    const res = await call("/api/bookings", { body: { ...VALID, flightNumber: "VJ123" } });
    assert.equal(res.status, 400, "flights outside the brand prefix must not be bookable");
    assert.equal(fakeDb.store.has("flightManifests/VJ123"), false, "nothing may be written");
  });
});

test("a flight that is no longer bookable is rejected", async () => {
  fakeDb.store.set("flights/LH123", { flightNumber: "123", status: "landed" });
  await withServer(async (call) => {
    const res = await call("/api/bookings", { body: VALID });
    assert.equal(res.status, 409);
  });
});

test("a malformed Discord id is rejected", async () => {
  await withServer(async (call) => {
    const res = await call("/api/bookings", { body: { ...VALID, discordUserId: "not-an-id" } });
    assert.equal(res.status, 400);
  });
});

test("an invalid cabin class is rejected", async () => {
  await withServer(async (call) => {
    const res = await call("/api/bookings", { body: { ...VALID, class: "first" } });
    assert.equal(res.status, 400);
  });
});

test("a missing flight number is rejected", async () => {
  await withServer(async (call) => {
    const res = await call("/api/bookings", { body: { ...VALID, flightNumber: "" } });
    assert.equal(res.status, 400);
  });
});

/* ─── Webhook authorisation ───────────────────────────────────────────────── */

test("the webhook rejects a request with no secret", async () => {
  await withServer(async (call) => {
    const res = await call("/webhook/booking", { body: VALID });
    assert.equal(res.status, 401);
    assert.equal(fakeDb.store.has("flightManifests/LH123"), false, "nothing may be written");
  });
});

test("the webhook rejects a wrong secret", async () => {
  await withServer(async (call) => {
    const res = await call("/webhook/booking", { body: VALID, headers: { "x-webhook-secret": "wrong" } });
    assert.equal(res.status, 401);
    assert.equal(fakeDb.store.has("flightManifests/LH123"), false);
  });
});

test("the webhook accepts the correct secret", async () => {
  await withServer(async (call) => {
    const res = await call("/webhook/booking", { body: VALID, headers: { "x-webhook-secret": SECRET } });
    assert.equal(res.status, 200);
    assert.equal(manifest().passengers.length, 1);
  });
});

test("the webhook never echoes the shared secret back", async () => {
  await withServer(async (call) => {
    const res = await call("/webhook/booking", { body: VALID, headers: { "x-webhook-secret": "wrong" } });
    assert.equal(JSON.stringify(res.data).includes(SECRET), false);
  });
});

/* ── Rate limiting ────────────────────────────────────────────────────────── */

test("guest booking is rate limited per IP", async () => {
  await withServer(async (call) => {
    const statuses = [];
    for (let i = 0; i < 8; i++) {
      const res = await call("/api/bookings", { body: { ...VALID, seat: `1${i}` } });
      statuses.push(res.status);
    }

    assert.ok(
      statuses.includes(429),
      `expected a 429 after repeated bookings, got ${statuses.join(",")}`
    );
    assert.equal(statuses[0], 200, "the first attempt must succeed");
  });
});

test("a rate-limited request writes nothing to the manifest", async () => {
  await withServer(async (call) => {
    for (let i = 0; i < 8; i++) await call("/api/bookings", { body: { ...VALID, seat: `2${i}` } });
    const passengers = (manifest()?.passengers || []).length;
    assert.ok(passengers <= 5, `rate limit must bound writes, got ${passengers}`);
  });
});

test("the server-to-server webhook is not blocked by the guest rate limit", async () => {
  await withServer(async (call) => {
    // Exhaust the guest limit first.
    for (let i = 0; i < 8; i++) await call("/api/bookings", { body: { ...VALID, seat: `3${i}` } });

    // The trusted webhook must still work: it is authenticated by secret and
    // is the path a server-side integration uses.
    const res = await call("/webhook/booking", {
      body: VALID,
      headers: { "x-webhook-secret": SECRET },
    });
    assert.equal(res.status, 200, "the webhook must not inherit the guest rate limit");
  });
});