/**
 * mileageSystem.js — Full Miles & More flight claim & migration system
 */
import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import { getMemberAccount, getOrCreateAccount, TIERS, DB_COLLECTIONS } from "./members.js";
import { calculateEarnings, applyPromotionCode, breakdownText } from "./mileageEngine.js";
import { createTimer } from "../timers/timers.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";
import { flightLabel } from "../config/brand.js";
import crypto from "crypto";

const CLAIM_CODE_LENGTH = 8;
const CLAIM_EXPIRY_HOURS = 7 * 24;

function generateClaimCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export async function createFlight({ flightNumber, departure, arrival, crewMembers, distanceKm, routeKey, guild }) {
  const db = getDb();
  const cleanNum = flightNumber.replace(/\s/g, "").replace(/^[A-Z]{2}/i, "");

  const existing = await db.collection(DB_COLLECTIONS.flights || "flights")
    .where("flightNumber", "==", cleanNum)
    .where("status", "!=", "cancelled")
    .limit(1).get();
  if (!existing.empty) throw new Error(`Flight ${cleanNum} already exists`);

  const dist = distanceKm || (await getRouteDistance(routeKey));
  const flightId = db.collection(DB_COLLECTIONS.flights || "flights").doc().id;

  await db.collection(DB_COLLECTIONS.flights || "flights").doc(flightId).set({
    id: flightId,
    flightNumber: cleanNum,
    departureAirport: departure,
    arrivalAirport: arrival,
    routeKey: routeKey || `${departure}-${arrival}`,
    distanceKm: dist,
    status: "open",
    claimCodes: [],
    crewMembers: crewMembers || [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    scheduledUnixTime: Math.floor(Date.now() / 1000) + 3600,
  });

  const codes = [];
  for (let i = 0; i < (crewMembers?.length || 5); i++) {
    const code = generateClaimCode();
    const claimId = db.collection("claims").doc().id;
    await db.collection("claims").doc(claimId).set({
      id: claimId,
      flightId,
      claimCode: code,
      status: "open",
      cabin: "economy",
      claimedAt: null,
      memberUserId: null,
      createdAt: new Date(),
    });
    codes.push(code);
  }
  await db.collection(DB_COLLECTIONS.flights || "flights").doc(flightId).update({ claimCodes: codes });

  return { flightId, codes };
}

async function getRouteDistance(routeKey) {
  try {
    const db = getDb();
    if (routeKey) {
      const snap = await db.collection("routes").doc(routeKey).get();
      if (snap.exists) return snap.data().distanceKm;
    }
    const defaultSnap = await db.collection("routes").doc("DEFAULT").get();
    return defaultSnap.exists ? defaultSnap.data().distanceKm : 800;
  } catch { return 800; }
}

export async function claimFlight({ code, cabin, memberId }) {
  const db = getDb();
  const claimSnap = await db.collection("claims").where("claimCode", "==", code.toUpperCase()).limit(1).get();
  if (claimSnap.empty) throw new Error("Invalid claim code");

  const claimDoc = claimSnap.docs[0];
  const claimData = claimDoc.data();
  if (claimData.status !== "open") throw new Error("This claim has already been used or expired");

  const flightSnap = await db.collection(DB_COLLECTIONS.flights || "flights").doc(claimData.flightId).get();
  if (!flightSnap.exists) throw new Error("Flight not found");
  const flight = flightSnap.data();

  const account = await getOrCreateAccount(memberId);
  const earnings = calculateEarnings({
    distanceKm: flight.distanceKm,
    cabin: cabin || "economy",
    membershipTier: account.membership?.tier || "Frequent Traveller",
    crew: false,
    mode: "distance",
  });

  // Idempotency guard: prevent double-claim via ledger lookup
  const idKey = `flight_claim:${claimDoc.id}:${memberId}`;
  const existingTx = await db.collection(DB_COLLECTIONS.mileageLedger || "mileageLedger")
    .where("idempotencyKey", "==", idKey).limit(1).get();
  if (!existingTx.empty) throw new Error("This flight has already been claimed");

  const now = new Date();
  const { applyLedgerEntry, TX_TYPE } = await import("./ledger.js");
  
  // Use ledger for the balance update atomically
  await applyLedgerEntry({
    userId: memberId,
    currency: "points",
    amount: earnings.awardMiles,
    type: TX_TYPE.FLIGHT_EARN,
    reason: `Flight ${flight.flightNumber} (${flight.departureAirport}→${flight.arrivalAirport})`,
    idempotencyKey: idKey,
    referenceType: "flight",
    referenceId: flight.id,
    lifetime: { pointsDelta: earnings.awardMiles, qualifyingPointsDelta: earnings.qualifyingPoints, qualifyingFlightDelta: 1 },
  });

  // Update legacy member record for backward compatibility
  await db.collection("members").doc(memberId).update({
    "awards.awardMiles.balance": account.awards.awardMiles.balance + earnings.awardMiles,
    "awards.awardMiles.lifetimeEarned": (account.awards.awardMiles.lifetimeEarned || 0) + earnings.awardMiles,
    "membership.statusPoints": (account.membership.statusPoints || 0) + earnings.statusPoints,
    "membership.qualifyingPoints": (account.membership.qualifyingPoints || 0) + earnings.qualifyingPoints,
    "membership.honPoints": (account.membership.honPoints || 0) + (earnings.honPoints || 0),
    "membership.lifetimeStatusPoints": (account.membership.lifetimeStatusPoints || 0) + earnings.statusPoints,
    "membership.totalFlights": (account.membership.totalFlights || 0) + 1,
    "membership.totalDistanceKm": (account.membership.totalDistanceKm || 0) + flight.distanceKm,
    "membership.lastEarningDate": now.toISOString(),
    "history.totalFlights": (account.history?.totalFlights || 0) + 1,
    [`history.cabinBreakdown.${cabin.toLowerCase().replace(/\s+/g, "_")}`]: ((account.history?.cabinBreakdown || {})[cabin.toLowerCase().replace(/\s+/g, "_")] || 0) + 1,
  });

  await db.collection("claims").doc(claimDoc.id).update({
    status: "claimed",
    claimedAt: now.toISOString(),
    memberUserId: memberId,
    cabin: cabin || "economy",
  });

  return { ...earnings, flight, claimCode: code };
}

export async function addPassengerManually({ flightId, memberId, cabin, notes }) {
  const db = getDb();
  const flightSnap = await db.collection(DB_COLLECTIONS.flights || "flights").doc(flightId).get();
  if (!flightSnap.exists) throw new Error("Flight not found");
  const flight = flightSnap.data();
  if (flight.status === "closed" || flight.status === "cancelled") throw new Error("Flight is no longer accepting passengers");

  const account = await getOrCreateAccount(memberId);
  const earnings = calculateEarnings({ distanceKm: flight.distanceKm, cabin, membershipTier: account.membership?.tier, crew: false, mode: "distance" });
  const now = new Date();
  const { applyLedgerEntry, TX_TYPE } = await import("./ledger.js");

  // Use ledger for the balance update atomically
  await applyLedgerEntry({
    userId: memberId,
    currency: "points",
    amount: earnings.awardMiles,
    type: TX_TYPE.FLIGHT_EARN,
    reason: `Manual addition: Flight ${flight.flightNumber} (${flight.departureAirport}→${flight.arrivalAirport}) [${cabin}]`,
    idempotencyKey: `manual_add:${flightId}:${memberId}:${Date.now()}`,
    referenceType: "flight",
    referenceId: flightId,
    lifetime: { pointsDelta: earnings.awardMiles, qualifyingPointsDelta: earnings.qualifyingPoints, qualifyingFlightDelta: 1 },
  });

  // Update legacy member record for backward compatibility
  await db.collection("members").doc(memberId).update({
    "awards.awardMiles.balance": account.awards.awardMiles.balance + earnings.awardMiles,
    "awards.awardMiles.lifetimeEarned": (account.awards.awardMiles.lifetimeEarned || 0) + earnings.awardMiles,
    "membership.statusPoints": (account.membership.statusPoints || 0) + earnings.statusPoints,
    "membership.qualifyingPoints": (account.membership.qualifyingPoints || 0) + earnings.qualifyingPoints,
    "membership.totalFlights": (account.membership.totalFlights || 0) + 1,
    "membership.totalDistanceKm": (account.membership.totalDistanceKm || 0) + flight.distanceKm,
    [`history.cabinBreakdown.${cabin.toLowerCase().replace(/\s+/g, "_")}`]: ((account.history?.cabinBreakdown || {})[cabin.toLowerCase().replace(/\s+/g, "_")] || 0) + 1,
  });

  return { ...earnings, flightNumber: flight.flightNumber };
}

export async function voidFlight({ flightId, staffId, reason = "Staff decision" }) {
  const db = getDb();
  const flightSnap = await db.collection(DB_COLLECTIONS.flights || "flights").doc(flightId).get();
  if (!flightSnap.exists) throw new Error("Flight not found");
  const flight = flightSnap.data();

  if (["cancelled", "void"].includes(flight.status)) throw new Error("Flight already cancelled/voided");

  // Collect all earnings for this flight
  const ledgerSnap = await db.collection(DB_COLLECTIONS.mileageLedger || "mileageLedger")
    .where("flightId", "==", flightId)
    .where("transactionType", "!=", "reversal")
    .get();

  // Reverse each earning record — authoritatively through the ledger, then sync legacy.
  const { applyLedgerEntry, TX_TYPE } = await import("./ledger.js");
  let reversed = 0;
  for (const doc of ledgerSnap.docs) {
    const tx = doc.data();
    const memberDoc = await db.collection(DB_COLLECTIONS.members || "members").doc(tx.userId).get();
    if (!memberDoc.exists) continue;
    const m = memberDoc.data();

    // 1) Authoritative reversal via ledger (debits rewardsAccounts).
    const revKey = `void:${doc.id}`;
    try {
      await applyLedgerEntry({
        userId: tx.userId,
        currency: "points",
        amount: -tx.amount,
        type: TX_TYPE.REVERSAL,
        reason: `Voided: ${reason}`,
        idempotencyKey: revKey,
        referenceType: "flight",
        referenceId: flightId,
      });
    } catch (e) {
      console.error(`[voidFlight] ledger reversal failed for ${tx.userId}:`, e.message);
      continue;
    }

    // 2) Legacy member sync for backward compatibility.
    const updates = {
      "awards.awardMiles.balance": Math.max(0, (m.awards?.awardMiles?.balance || 0) - tx.amount),
      "membership.statusPoints": Math.max(0, (m.membership?.statusPoints || 0) - (tx.statusPoints || 0)),
      "membership.qualifyingPoints": Math.max(0, (m.membership?.qualifyingPoints || 0) - (tx.qualifyingPoints || 0)),
      "membership.totalFlights": Math.max(0, (m.membership?.totalFlights || 0) - 1),
    };
    if (tx.honPoints) updates["membership.honPoints"] = Math.max(0, (m.membership?.honPoints || 0) - tx.honPoints);
    const cabinKey = tx.cabin?.toLowerCase() || "economy";
    updates[`history.cabinBreakdown.${cabinKey}`] = Math.max(0, ((m.history?.cabinBreakdown || {})[cabinKey] || 0) - 1);
    await db.collection(DB_COLLECTIONS.members || "members").doc(tx.userId).update(updates);

    // 3) Preserve a legacy reversal marker for old-mileageLedger readers.
    await db.collection(DB_COLLECTIONS.mileageLedger || "mileageLedger").add({
      userId: tx.userId, type: "reversal", transactionType: "flight_void_reversal",
      amount: -tx.amount, reason: `Voided: ${reason}`, referenceId: doc.id, appliedAt: new Date(),
    });
    reversed++;
  }

  await db.collection(DB_COLLECTIONS.flights || "flights").doc(flightId).update({
    status: "voided", voidedBy: staffId, voidedAt: new Date(), voidReason: reason,
  });

  return { voidedFlight: flight.flightNumber, reversedTransactions: reversed };
}

export async function getFlightInfo(flightId) {
  const db = getDb();
  const snap = await db.collection(DB_COLLECTIONS.flights || "flights").doc(flightId).get();
  if (!snap.exists) return null;
  const data = snap.data();
  const claimSnap = await db.collection("claims").where("flightId", "==", flightId).get();
  const passengers = claimSnap.docs.filter(d => d.data().status === "claimed");
  return {
    ...data, passengerCount: passengers.length,
    claimStats: { total: claimSnap.size, claimed: passengers.length, open: claimSnap.size - passengers.length },
  };
}

export async function listActiveFlightCodes(includeExpired = false) {
  const db = getDb();
  const now = new Date();
  let q = await db.collection(DB_COLLECTIONS.flights || "flights").where("status", "==", "open").get();
  const results = [];
  for (const doc of q.docs) {
    const f = doc.data();
    if (!includeExpired && f.expiresAt && new Date(f.expiresAt) < now) continue;
    const claimSnap = await db.collection("claims").where("flightId", "==", f.id).get();
    for (const c of claimSnap.docs) {
      if (c.data().status === "open") {
        results.push({
          flightId: f.id, flightNumber: f.flightNumber,
          code: c.data().claimCode, expiresAt: f.expiresAt,
        });
      }
    }
  }
  return results;
}

export async function removePassenger({ flightId, memberId, reason }) {
  const db = getDb();
  const { applyLedgerEntry, TX_TYPE } = await import("./ledger.js");
  // Find the claim record
  const claimSnap = await db.collection("claims").where("flightId", "==", flightId).where("memberUserId", "==", memberId).limit(1).get();
  if (claimSnap.empty) throw new Error("No claim found for this member on this flight");
  const claim = claimSnap.docs[0].data();
  const txSnap = await db.collection(DB_COLLECTIONS.mileageLedger || "mileageLedger")
    .where("userId", "==", memberId).where("flightId", "==", flightId).orderBy("appliedAt", "desc").limit(1).get();
  if (txSnap.empty) throw new Error("No earning record found");
  const tx = txSnap.docs[0].data();

  // Authoritative reversal through the ledger (debits the rewardsAccounts balance).
  const revKey = `rev:${txSnap.docs[0].id}`;
  const rev = await applyLedgerEntry({
    userId: memberId,
    currency: "points",
    amount: -tx.amount,
    type: TX_TYPE.REVERSAL,
    reason: `Removed from flight ${flightId}: ${reason}`,
    idempotencyKey: revKey,
    referenceType: "flight",
    referenceId: flightId,
  });

  // Legacy member sync for backward compatibility (mirrors the authoritative balance).
  const memberDoc = await db.collection(DB_COLLECTIONS.members || "members").doc(memberId).get();
  const m = memberDoc.exists ? memberDoc.data() : { awards: { awardMiles: { balance: 0 } } };
  await db.collection(DB_COLLECTIONS.members || "members").doc(memberId).update({
    "awards.awardMiles.balance": Math.max(0, (m.awards?.awardMiles?.balance || 0) - tx.amount),
    "membership.statusPoints": Math.max(0, (m.membership?.statusPoints || 0) - (tx.statusPoints || 0)),
    "membership.qualifyingPoints": Math.max(0, (m.membership?.qualifyingPoints || 0) - (tx.qualifyingPoints || 0)),
    "membership.totalFlights": Math.max(0, (m.membership?.totalFlights || 0) - 1),
  });

  // Preserve a legacy reversal marker for the old-mileageLedger readers.
  await db.collection(DB_COLLECTIONS.mileageLedger || "mileageLedger").add({
    userId: memberId, type: "reversal", transactionType: "passenger_remove",
    amount: -tx.amount, reason: `Removed from flight: ${reason}`, referenceId: txSnap.docs[0].id, appliedAt: new Date(),
  });

  return { removed: true, reversedMiles: tx.amount, ledgerApplied: rev.applied };
}

export async function closeFlight(flightId) {
  const db = getDb();
  await db.collection(DB_COLLECTIONS.flights || "flights").doc(flightId).update({
    status: "closed", closedAt: new Date(),
  });
}

export async function seedMileageSystem(logger) {
  const db = getDb();
  // Ensure default config docs exist
  const earningRef = db.collection("config").doc("earningRules");
  const earningSnap = await earningRef.get();
  if (!earningSnap.exists) {
    await earningRef.set({ mode: "distance", flatMiles: 1500, lastUpdated: new Date() });
  }
  logger.info("[mileage] Default config verified");
}

export async function migrateExistingRewards(logger) {
  logger.info("[migration] Starting rewards-to-mileage conversion...");
  const db = getDb();
  const snap = await db.collection("rewardsAccounts").get();
  const { applyLedgerEntry, TX_TYPE, ensureAccount } = await import("./ledger.js");
  let migrated = 0;
  const CREDIT_TO_MILES_RATE = 16.77;

  for (const doc of snap.docs) {
    const data = doc.data();
    const totalMiles = Math.round((data.points || 0) + (data.credits || 0) * CREDIT_TO_MILES_RATE);
    if (totalMiles < 50) continue;

    // Ensure the authoritative account exists before we touch anything.
    await ensureAccount(doc.id);

    const memberData = {
      userId: doc.id,
      displayName: `Migrated_${doc.id.slice(0, 6)}`,
      passwordHash: "migrated_no_password",
      createdAt: data.createdAt || new Date(),
      membership: { tier: "Frequent Traveller", statusPoints: 0, qualifyingPoints: 0, honPoints: 0, lifetimeStatusPoints: 0, totalFlights: 0, totalDistanceKm: 0, lastEarningDate: null, qualificationPeriod: { startDate: null, endDate: null, pointsThisPeriod: 0 }, tierHistory: [] },
      awards: { awardMiles: { balance: totalMiles, lifetimeEarned: totalMiles, lifetimeSpent: 0 }, loyalty: { bonusMiles: 0, membershipBonus: 0, statusBonus: 0, eventBonus: 0 } },
      history: { totalFlights: 0, cabinBreakdown: { economy: 0, premium_economy: 0, business: 0, first: 0 } },
    };

    // Authoritative ledger entry so rewardsAccounts.balance equals the ledger sum.
    await applyLedgerEntry({
      userId: doc.id,
      currency: "points",
      amount: totalMiles,
      type: TX_TYPE.MIGRATED === undefined ? "migration" : TX_TYPE.MIGRATED,
      reason: "Legacy rewards/miles migration",
      idempotencyKey: `migrate:${doc.id}:${totalMiles}`,
      lifetime: { pointsDelta: totalMiles },
    }).catch(() => {
      // Already migrated (idempotency key exists) — still ensure the legacy doc is in place.
    });

    await db.collection("members").doc(doc.id).set(memberData);
    await db.collection("migrations").doc(doc.id).set({ from: "rewardsAccounts", to: "members", originalPoints: data.points, originalCredits: data.credits, convertedMiles: totalMiles, migratedAt: new Date() });
    migrated++;
    logger.info(`[migration] Migrated ${doc.id}: ${totalMiles} miles`);
  }

  logger.info(`[migration] Complete: ${migrated} accounts migrated`);
  return migrated;
}

export default { createFlight, claimFlight, addPassengerManually, voidFlight, migrateExistingRewards, getFlightInfo, listActiveFlightCodes, removePassenger, closeFlight, seedMileageSystem };