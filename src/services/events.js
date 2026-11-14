/**
 * events.js — Loyalty events management service.
 */
import { getDb } from "./firestore.js";
import { DB_COLLECTIONS } from "./members.js";

const COLLECTION = "events";

export async function createEvent({ name, description, bonusType, bonusValue, startTime, endTime, eligibility }) {
  const db = getDb();
  const id = db.collection(COLLECTION).doc().id;
  await db.collection(COLLECTION).doc(id).set({
    id, name, description: description || "", bonusType: bonusType || "multiplier",
    bonusValue: Number(bonusValue) || 1.2,
    startTime: new Date(startTime), endTime: new Date(endTime),
    eligibility: eligibility || "all", // all | frequent_traveler | senator | hon_circle
    status: "scheduled", createdBy: null, createdAt: new Date(),
  });
  return id;
}

export async function stopEvent(eventId, stoppedBy) {
  const db = getDb();
  await db.collection(COLLECTION).doc(eventId).update({
    status: "stopped", stoppedAt: new Date(), stoppedBy,
  });
}

export async function listEvents(statusFilter = null) {
  const db = getDb();
  let q = db.collection(COLLECTION);
  if (statusFilter) {
    q = q.where("status", "==", statusFilter);
  }
  const snap = await q.orderBy("startTime", "asc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getActiveEvents() {
  const now = new Date();
  const events = await listEvents();
  return events.filter(e => e.status === "scheduled" && new Date(e.startTime) <= now && new Date(e.endTime) >= now);
}

export async function getEventById(eventId) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).doc(eventId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/** Get applicable event bonuses for a given membership tier during an event window. */
export function getEligibleBonuses(events, membershipTier) {
  const now = new Date();
  const eligible = [];
  for (const ev of events) {
    if (ev.status !== "scheduled") continue;
    const start = new Date(ev.startTime);
    const end = new Date(ev.endTime);
    if (now < start || now > end) continue;
    // Check eligibility
    const elig = ev.eligibility || "all";
    if (elig !== "all") {
      const tierOrder = ["Frequent Traveller", "Senator", "HON Circle"];
      const tierIdx = tierOrder.indexOf(membershipTier);
      const eligIdx = tierOrder.indexOf(elig);
      if (tierIdx < eligIdx) continue;
    }
    eligible.push(ev);
  }
  return eligible;
}

export async function seedDefaultEvents() {
  // Optional: pre-seed common promotional events
  return true;
}

export default {
  createEvent, stopEvent, listEvents, getActiveEvents, getEventById, getEligibleBonuses,
};
