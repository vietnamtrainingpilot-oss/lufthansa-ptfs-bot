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

  const now = new Date();
  await Promise.all([
    db.collection("members").doc(memberId).update({
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
    }),
    db.collection(DB_COLLECTIONS.mileageLedger || "mileageLedger").add({
      userId: memberId,
      type: "earning",
      transactionType: "flight_claim",
      amount: earnings.awardMiles,
      reason: `Flight ${flight.flightNumber} (${flight.departureAirport}→${flight.arrivalAirport})`,
      flightId: flight.id,
      claimsId: claimDoc.id,
      cabin: cabin || "economy",
      statusPoints: earnings.statusPoints,
      qualifyingPoints: earnings.qualifyingPoints,
      honPoints: earnings.honPoints,
      appliedAt: now,
    }),
    db.collection("claims").doc(claimDoc.id).update({
      status: "claimed",
      claimedAt: now.toISOString(),
      memberUserId: memberId,
      cabin: cabin || "economy",
    }),
  ]);

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

  await Promise.all([
    db.collection("members").doc(memberId).update({
      "awards.awardMiles.balance": account.awards.awardMiles.balance + earnings.awardMiles,
      "awards.awardMiles.lifetimeEarned": (account.awards.awardMiles.lifetimeEarned || 0) + earnings.awardMiles,
      "membership.statusPoints": (account.membership.statusPoints || 0) + earnings.statusPoints,
      "membership.qualifyingPoints": (account.membership.qualifyingPoints || 0) + earnings.qualifyingPoints,
      "membership.totalFlights": (account.membership.totalFlights || 0) + 1,
      "membership.totalDistanceKm": (account.membership.totalDistanceKm || 0) + flight.distanceKm,
      [`history.cabinBreakdown.${cabin.toLowerCase().replace(/\s+/g, "_")}`]: ((account.history?.cabinBreakdown || {})[cabin.toLowerCase().replace(/\s+/g, "_")] || 0) + 1,
    }),
    db.collection(DB_COLLECTIONS.mileageLedger || "mileageLedger").add({
      userId: memberId, type: "earning", transactionType: "manual_add", amount: earnings.awardMiles,
      reason: `Manual addition: Flight ${flight.flightNumber} (${flight.departureAirport}→${flight.arrivalAirport}) [${cabin}]`,
      flightId, cabin, statusPoints: earnings.statusPoints, qualifyingPoints: earnings.qualifyingPoints,
      honPoints: earnings.honPoints, notes, appliedAt: now,
    }),
  ]);
  return { ...earnings, flightNumber: flight.flightNumber };
}

export async function voidFlight({ flightId, staffId }) {
  const db = getDb();
  const flightSnap = await db.collection(DB_COLLECTIONS.flights || "flights").doc(flightId).get();
  if (!flightSnap.exists) throw new Error("Flight not found");
  const flight = flightSnap.data();

  if (["cancelled", "void"].includes(flight.status)) throw new Error("Flight already cancelled/voided");

  const ledgerSnap = await db.collection(DB_COLLECTIONS.mileageLedger || "mileageLedger")
    .where("flightId", "==", flightId)
    .where("transactionType", "==", "flight_claim")
    .get();

  await Promise.all(ledgerSnap.docs.map(async d => {
    const tx = d.data();
    const memberDoc = await db.collection(DB_COLLECTIONS.members || "members").doc(tx.userId).get();
    if (!memberDoc.exists) return;
    const m = memberDoc.data();
    const updates = {
      "awards.awardMiles.balance": Math.max(0, (m.awards?.awardMiles?.balance || 0) - tx.amount),
      "membership.statusPoints": Math.max(0, (m.membership?.statusPoints || 0) - (tx.statusPoints || 0)),
      "membership.qualifyingPoints": Math.max(0, (m.membership?.qualifyingPoints || 0) - (tx.qualifyingPoints || 0)),
      "membership.totalFlights": Math.max(0, (m.membership?.totalFlights || 0) - 1),
      [`history.cabinBreakdown.${tx.cabin?.toLowerCase() || "economy"}`]: Math.max(0, (m.history?.cabinBreakdown || {})[tx.cabin?.toLowerCase()] || 0),
    };
    if (tx.honPoints) updates["membership.honPoints"] = Math.max(0, (m.membership?.honPoints || 0) - tx.honPoints);
    await db.collection(DB_COLLECTIONS.members || "members").doc(tx.userId).update(updates);
    await db.collection(DB_COLLECTIONS.mileageLedger || "mileageLedger").doc(d.id).update({ type: "reversal", transactionType: "flight_void", appliedAt: new Date() });
  }));

  await db.collection(DB_COLLECTIONS.flights || "flights").doc(flightId).update({ status: "voided", voidedBy: staffId, voidedAt: new Date() });

  return { voidedFlight: flight.flightNumber, reversedTransactions: ledgerSnap.size };
}

export async function migrateExistingRewards(logger) {
  logger.info("[migration] Starting rewards-to-mileage conversion...");
  const db = getDb();
  const snap = await db.collection("rewardsAccounts").get();
  let migrated = 0;
  const CREDIT_TO_MILES_RATE = 16.77;

  for (const doc of snap.docs) {
    const data = doc.data();
    const totalMiles = (data.points || 0) + (data.credits || 0) * CREDIT_TO_MILES_RATE;
    if (totalMiles < 50) continue;

    const memberData = {
      userId: doc.id,
      displayName: `Migrated_${doc.id.slice(0, 6)}`,
      passwordHash: "migrated_no_password",
      createdAt: data.createdAt || new Date(),
      membership: { tier: "Frequent Traveller", statusPoints: 0, qualifyingPoints: 0, honPoints: 0, lifetimeStatusPoints: 0, totalFlights: 0, totalDistanceKm: 0, lastEarningDate: null, qualificationPeriod: { startDate: null, endDate: null, pointsThisPeriod: 0 }, tierHistory: [] },
      awards: { awardMiles: { balance: Math.round(totalMiles), lifetimeEarned: Math.round(totalMiles), lifetimeSpent: 0 }, loyalty: { bonusMiles: 0, membershipBonus: 0, statusBonus: 0, eventBonus: 0 } },
      history: { totalFlights: 0, cabinBreakdown: { economy: 0, premium_economy: 0, business: 0, first: 0 } },
    };

    await db.collection("members").doc(doc.id).set(memberData);
    await db.collection("migrations").doc(doc.id).set({ from: "rewardsAccounts", to: "members", originalPoints: data.points, originalCredits: data.credits, convertedMiles: Math.round(totalMiles), migratedAt: new Date() });
    migrated++;
    logger.info(`[migration] Migrated ${doc.id}: ${Math.round(totalMiles)} miles`);
  }

  logger.info(`[migration] Complete: ${migrated} accounts migrated`);
  return migrated;
}

export default { createFlight, claimFlight, addPassengerManually, voidFlight, migrateExistingRewards };