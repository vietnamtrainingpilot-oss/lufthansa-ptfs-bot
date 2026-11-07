/**
 * manifest.js — Flight passenger manifest and verified-participation gate.
 *
 * There is no passenger manifest in the existing build, so this introduces one
 * without duplicating the flights collection: manifests live in
 * `flightManifests/{flightId}` and are keyed by the existing flight id.
 *
 * A passenger only earns a flight reward when their entry is:
 *   - present in the manifest, AND
 *   - bookingStatus === "confirmed", AND
 *   - presenceStatus === "present", AND
 *   - eligible === true, AND
 *   - not marked as a no-show / removed / test booking
 *
 * Staff can set presence to present / no-show / removed and must confirm
 * (finalize) the manifest before any award is written.
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import { PRESENCE, BOOKING_STATUS, isPassengerEligible, summariseEligible, looksLikeTestBooking } from "./manifestRules.js";

export { PRESENCE, BOOKING_STATUS, isPassengerEligible, summariseEligible };

const MANIFESTS = "flightManifests";

/**
 * Flat, queryable mirror of `passengers[].userId`.
 *
 * Firestore cannot `array-contains` match a nested field of an array of
 * objects, so the member dashboard needs a scalar array to query. This is
 * derived state: it is always recomputed from `passengers` inside the same
 * transaction that mutates `passengers`, so the two can never drift.
 */
function syncPassengerIds(passengers) {
  const ids = new Set();
  for (const p of passengers) {
    if (p && p.userId) ids.add(String(p.userId));
  }
  return [...ids];
}

/**
 * Create or fetch the manifest shell for a flight.
 */
export async function ensureManifest(flightId, { flightNumber = null, departure = null, arrival = null } = {}) {
  const db = getDb();
  const ref = db.collection(MANIFESTS).doc(flightId);
  const snap = await ref.get();
  if (snap.exists) return { id: flightId, ...snap.data() };
  await ref.set({
    flightId,
    flightNumber,
    departure,
    arrival,
    passengers: [],
    finalized: false,
    finalizedById: null,
    finalizedAt: null,
    rewardsApplied: false,
    rewardsAppliedAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { id: flightId, flightId, flightNumber, passengers: [], finalized: false, rewardsApplied: false };
}

export function syncPassengerIdsForTest(passengers) {
  return syncPassengerIds(Array.isArray(passengers) ? passengers : []);
}

export async function getManifest(flightId) {
  const db = getDb();
  const snap = await db.collection(MANIFESTS).doc(flightId).get();
  if (!snap.exists) return null;
  return { id: snap.data().flightId, ...snap.data() };
}

/**
 * Add or update one passenger entry. Idempotent on `userId` per flight.
 */
export async function upsertPassenger(flightId, entry) {
  const db = getDb();
  const ref = db.collection(MANIFESTS).doc(flightId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? snap.data()
      : { flightId, passengers: [], finalized: false, rewardsApplied: false };

    const passengers = Array.isArray(data.passengers) ? [...data.passengers] : [];
    const now = admin.firestore.FieldValue.serverTimestamp();

    const isTest = looksLikeTestBooking(entry);

    const record = {
      userId: String(entry.userId),
      displayName: entry.displayName ? String(entry.displayName).slice(0, 80) : null,
      bookingId: entry.bookingId ? String(entry.bookingId) : null,
      cabinClass: entry.cabinClass ? String(entry.cabinClass).toLowerCase() : "economy",
      seat: entry.seat ? String(entry.seat).slice(0, 20) : null,
      bookingStatus: entry.bookingStatus || BOOKING_STATUS.CONFIRMED,
      presenceStatus: entry.presenceStatus || PRESENCE.UNMARKED,
      eligible: entry.eligible === undefined ? true : !!entry.eligible,
      isTest,
      notes: entry.notes ? String(entry.notes).slice(0, 300) : null,
      markedById: entry.markedById || null,
      updatedAt: now,
      createdAt: now,
    };

    const idx = passengers.findIndex((p) => p.userId === record.userId);
    if (idx >= 0) {
      record.createdAt = passengers[idx].createdAt || now;
      passengers[idx] = { ...passengers[idx], ...record };
    } else {
      passengers.push(record);
    }

    tx.set(
      ref,
      {
        flightId,
        passengers,
        passengerIds: syncPassengerIds(passengers),
        updatedAt: now,
        ...(snap.exists ? {} : { createdAt: now, finalized: false, rewardsApplied: false }),
      },
      { merge: true }
    );
    return record;
  });
}

/**
 * Set presence for one passenger (staff workflow).
 */
export async function setPresence(flightId, userId, presenceStatus, { eligible, markedById, notes } = {}) {
  const db = getDb();
  const ref = db.collection(MANIFESTS).doc(flightId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Manifest not found");
    const data = snap.data();
    const passengers = [...(data.passengers || [])];
    const idx = passengers.findIndex((p) => p.userId === String(userId));
    if (idx < 0) return null;
    passengers[idx] = {
      ...passengers[idx],
      presenceStatus,
      eligible: eligible === undefined ? passengers[idx].eligible : !!eligible,
      markedById: markedById || passengers[idx].markedById,
      notes: notes === undefined ? passengers[idx].notes : String(notes || "").slice(0, 300),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const now = admin.firestore.FieldValue.serverTimestamp();
    tx.update(ref, {
      passengers,
      passengerIds: syncPassengerIds(passengers),
      updatedAt: now,
    });
    return passengers[idx];
  });
}

/**
 * Mark the manifest as finalized by an authorized staff member.
 */
export async function finalizeManifest(flightId, staffId) {
  const db = getDb();
  const ref = db.collection(MANIFESTS).doc(flightId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Manifest not found");
    tx.update(ref, {
      finalized: true,
      finalizedById: staffId,
      finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
}

export async function isRewardsApplied(flightId) {
  const m = await getManifest(flightId);
  return !!m?.rewardsApplied;
}

/**
 * Flag that rewards have been applied. Guarded so a re-run cannot re-apply.
 */
export async function markRewardsApplied(flightId) {
  const db = getDb();
  const ref = db.collection(MANIFESTS).doc(flightId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Manifest not found");
    if (snap.data().rewardsApplied) return false; // already applied
    tx.update(ref, {
      rewardsApplied: true,
      rewardsAppliedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
}

export default {
  PRESENCE,
  BOOKING_STATUS,
  ensureManifest,
  getManifest,
  upsertPassenger,
  setPresence,
  isPassengerEligible,
  summariseEligible,
  finalizeManifest,
  isRewardsApplied,
  markRewardsApplied,
};