/**
 * missions.js — Configurable mission system.
 *
 * Rules:
 *  - Progress advances only from verified events (a completed eligible flight),
 *    never from a user clicking a button or submitting text.
 *  - One-time claim per member per mission, enforced transactionally.
 *  - Caps and expiry enforced server-side.
 *
 * Objective types are deliberately small — this is a rules-based module, not a
 * quest engine.
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import { CURRENCY } from "../config/loyaltyConfig.js";
import { TX_TYPE, applyLedgerEntry, writeAudit } from "./ledger.js";
import { getLoyaltyConfig } from "./loyaltyStore.js";

const MISSIONS = "missions";
const PROGRESS = "missionProgress";

export const OBJECTIVE = {
  FLIGHTS_IN_PERIOD: "flightsInPeriod",
  FIRST_TIME_ROUTE: "firstTimeRoute",
  FLIGHTS_IN_CLASS: "flightsInClass",
  FLIGHTS_TO_DESTINATIONS: "flightsToDestinations",
  STAFF_CONFIRMED_EVENT: "staffConfirmedEvent",
};

function progressId(missionId, userId) {
  return `${missionId}_${userId}`;
}

function periodKey(mission, at) {
  // Weekly missions key off ISO week, monthly off YYYY-MM.
  const d = at instanceof Date ? at : new Date(at);
  if (mission.period === "daily") return d.toISOString().slice(0, 10);
  if (mission.period === "monthly") return d.toISOString().slice(0, 7);
  // weekly ISO year-week
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${weekNo}`;
}

/**
 * Create or update a mission (staff only).
 */
export async function upsertMission(mission, staffId) {
  const db = getDb();
  const id = mission.id || db.collection(MISSIONS).doc().id;
  const doc = {
    id,
    title: String(mission.title || "").slice(0, 120),
    description: String(mission.description || "").slice(0, 400),
    objective: mission.objective,
    target: Math.max(1, Math.floor(Number(mission.target) || 1)),
    period: mission.period || null, // "daily" | "weekly" | "monthly" | null
    startAt: mission.startAt || null,
    endAt: mission.endAt || null,
    rewardCurrency: mission.rewardCurrency === CURRENCY.CREDITS ? CURRENCY.CREDITS : CURRENCY.POINTS,
    rewardAmount: Math.max(0, Math.floor(Number(mission.rewardAmount) || 0)),
    // Objective parameters
    routeKey: mission.routeKey || null, // for firstTimeRoute, e.g. "HAN-DAD"
    cabinClass: mission.cabinClass || null, // for flightsInClass
    destinations: Array.isArray(mission.destinations) ? mission.destinations.slice(0, 50) : null,
    enabled: mission.enabled !== false,
    createdById: staffId,
    createdAt: mission.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!doc.title) throw new Error("Mission title is required");
  if (!doc.objective) throw new Error("Mission objective is required");
  await db.collection(MISSIONS).doc(id).set(doc, { merge: true });
  return doc;
}

export async function setMissionEnabled(missionId, enabled, staffId, reason) {
  const db = getDb();
  await db.collection(MISSIONS).doc(missionId).set(
    { enabled, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedById: staffId },
    { merge: true }
  );
  await writeAudit({ actorId: staffId, action: "setMissionEnabled", reason, before: { enabled: !enabled }, after: { enabled }, referenceType: "mission", referenceId: missionId });
  return { id: missionId, enabled };
}

export async function listMissions({ activeOnly = true } = {}) {
  const db = getDb();
  const snap = await db.collection(MISSIONS).get();
  let items = snap.docs.map((d) => d.data());
  if (activeOnly) items = items.filter((m) => m.enabled !== false);
  return items;
}

export async function getMission(missionId) {
  const db = getDb();
  const snap = await db.collection(MISSIONS).doc(missionId).get();
  return snap.exists ? snap.data() : null;
}

function isMissionLive(mission, at) {
  if (mission.enabled === false) return false;
  if (mission.startAt && at < mission.startAt) return false;
  if (mission.endAt && at > mission.endAt) return false;
  return true;
}

/**
 * Advance mission progress from a VERIFIED flight completion.
 * Called only from the flight reward path, after eligibility is confirmed.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {object} params.flight — the completed flight record
 * @param {Date}   [params.at]
 */
export async function progressFromVerifiedFlight({ userId, flight, at = new Date() }) {
  const db = getDb();
  const missions = await listMissions();
  const advanced = [];

  const routeKey = buildRouteKey(flight);
  const cabin = String(flight.cabinClass || "economy").toLowerCase();

  for (const mission of missions) {
    if (!isMissionLive(mission, at)) continue;

    let matches = false;
    switch (mission.objective) {
      case OBJECTIVE.FLIGHTS_IN_PERIOD:
        matches = true;
        break;
      case OBJECTIVE.FIRST_TIME_ROUTE:
        matches = !!mission.routeKey && mission.routeKey === routeKey;
        break;
      case OBJECTIVE.FLIGHTS_IN_CLASS:
        matches = !!mission.cabinClass && mission.cabinClass === cabin;
        break;
      case OBJECTIVE.FLIGHTS_TO_DESTINATIONS:
        matches = !!mission.destinations && mission.destinations.includes(flight.arrivalAirport);
        break;
      case OBJECTIVE.STAFF_CONFIRMED_EVENT:
        matches = false; // advanced only via staffConfirmedEvent()
        break;
      default:
        matches = false;
    }
    if (!matches) continue;

    // Period missions reset each period via the period key in the progress doc.
    const pk = mission.period ? periodKey(mission, at) : "all";
    const pRef = db.collection(PROGRESS).doc(progressId(mission.id, userId));

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(pRef);
      const data = snap.exists ? snap.data() : null;

      // Reset when the period rolled over.
      const existing = data && data.periodKey === pk ? data : { progress: 0, periodKey: pk, claimed: false };
      if (existing.claimed) return { skipped: true };

      const nextProgress = Math.min(mission.target, (existing.progress || 0) + 1);
      tx.set(
        pRef,
        {
          missionId: mission.id,
          userId: String(userId),
          periodKey: pk,
          progress: nextProgress,
          completed: nextProgress >= mission.target,
          claimed: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return { skipped: false, completed: nextProgress >= mission.target, progress: nextProgress };
    });

    if (!result.skipped) {
      advanced.push({ missionId: mission.id, title: mission.title, progress: result.progress, completed: result.completed });
    }
  }
  return advanced;
}

function buildRouteKey(flight) {
  const dep = String(flight.departureAirport || "").toUpperCase();
  const arr = String(flight.arrivalAirport || "").toUpperCase();
  return `${dep}-${arr}`;
}

/**
 * Claim a completed, unclaimed mission reward. One-time and atomic.
 *
 * The progress flag and the ledger entry are written in the SAME transaction
 * (via the ledger's extraWrites hook). Marking claimed first in a separate
 * transaction would permanently consume the reward if the award then failed,
 * leaving the member with a "claimed" mission and nothing credited.
 */
export async function claimMissionReward({ userId, missionId, nowMs = Date.now() }) {
  const db = getDb();
  const mission = await getMission(missionId);
  if (!mission) throw Object.assign(new Error("Mission not found."), { code: "NOT_FOUND" });
  if (!isMissionLive(mission, new Date(nowMs))) {
    throw Object.assign(new Error("This mission is not currently active."), { code: "INACTIVE" });
  }

  const pRef = db.collection(PROGRESS).doc(progressId(missionId, userId));
  const snap = await pRef.get();
  const data = snap.exists ? snap.data() : null;

  if (!data || !data.completed) throw Object.assign(new Error("Mission not completed yet."), { code: "NOT_COMPLETED" });
  if (data.claimed) throw Object.assign(new Error("Reward already claimed for this mission."), { code: "ALREADY_CLAIMED" });

  const ledgerKey = `mission:${missionId}:${userId}`;
  await applyLedgerEntry({
    userId,
    currency: mission.rewardCurrency,
    amount: mission.rewardAmount,
    type: TX_TYPE.MISSION_EARN,
    reason: `Mission: ${mission.title}`,
    idempotencyKey: ledgerKey,
    referenceType: "mission",
    referenceId: missionId,
    metadata: { missionTitle: mission.title },
    extraWrites: async (tx) => {
      // Re-check the claim flag inside the transaction so a double-click
      // cannot double-claim even under concurrent requests.
      const s = await tx.get(pRef);
      const d = s.exists ? s.data() : null;
      if (!d || !d.completed) throw Object.assign(new Error("Mission not completed yet."), { code: "NOT_COMPLETED" });
      if (d.claimed) throw Object.assign(new Error("Reward already claimed for this mission."), { code: "ALREADY_CLAIMED" });
      tx.update(pRef, {
        claimed: true,
        claimedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    },
  });

  return { claimed: true, missionId, rewardCurrency: mission.rewardCurrency, rewardAmount: mission.rewardAmount };
}

/**
 * A member's mission view: each live mission with their progress.
 */
export async function getMemberMissions(userId) {
  const db = getDb();
  const missions = await listMissions();
  const out = [];
  for (const m of missions) {
    const snap = await db.collection(PROGRESS).doc(progressId(m.id, userId)).get();
    const p = snap.exists ? snap.data() : null;
    out.push({
      id: m.id,
      title: m.title,
      description: m.description,
      objective: m.objective,
      target: m.target,
      period: m.period,
      rewardCurrency: m.rewardCurrency,
      rewardAmount: m.rewardAmount,
      progress: p?.progress || 0,
      completed: !!p?.completed,
      claimed: !!p?.claimed,
      claimable: !!p?.completed && !p?.claimed,
    });
  }
  return out;
}

export default {
  OBJECTIVE,
  upsertMission,
  setMissionEnabled,
  listMissions,
  getMission,
  progressFromVerifiedFlight,
  claimMissionReward,
  getMemberMissions,
};