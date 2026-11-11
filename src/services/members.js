/**
 * members.js — Lufthansa Miles & More Member Account Service
 */
import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import config from "../config/config.js";

const COLLECTION = "members";

export const TIERS = {
  "Frequent Traveller": { statusPoints: 0, qualifyingPoints: 0, label: "Frequent Traveller", benefits: ["Business Lounge access", "Business Class check-in", "Priority boarding", "Additional baggage allowance", "Exclusive events"] },
  Senator: { statusPoints: 2000, qualifyingPoints: 1000, label: "Senator", benefits: ["Senator & Star Alliance Gold Lounge access", "First Class check-in", "Priority boarding and boarding group", "Upgrade vouchers", "Dedicated check-in counters", "Complimentary seat selection"] },
  "HON Circle": { statusPoints: 6000, qualifyingPoints: 1500, label: "HON Circle", benefits: ["HON Circle lounge access", "First Class check-in", "Chauffeur and transfer service", "Personal HON Circle service", "Priority on award flight bookings", "Upgrade vouchers", "Complimentary upgrades"] },
};

function hashPassword(pw) {
  let h = 0;
  for (let i = 0; i < pw.length; i++) {
    const c = pw.charCodeAt(i);
    const hi = h >> (i % 4 * 8);
    const hs = h & (0xff << (24 - i % 4 * 8));
    h = hi | hs;
  }
  return h.toString(16);
}

export async function signUpClient(user, password) {
  const db = getDb();
  const existing = await db.collection(COLLECTION).where("userId", "==", user.id).get();
  if (!existing.empty) throw new Error("Account already registered");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const accountData = {
    userId: user.id,
    displayName: user.username,
    passwordHash: hashPassword(password),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    membership: {
      tier: "Frequent Traveller",
      statusPoints: 0,
      qualifyingPoints: 0,
      honPoints: 0,
      lifetimeStatusPoints: 0,
      totalFlights: 0,
      totalDistanceKm: 0,
      lastEarningDate: null,
      qualificationPeriod: { startDate: null, endDate: null, pointsThisPeriod: 0 },
      tierHistory: [],
    },
    awards: {
      awardMiles: { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 },
      loyalty: { bonusMiles: 0, membershipBonus: 0, statusBonus: 0, eventBonus: 0 },
    },
    history: { totalFlights: 0, cabinBreakdown: { economy: 0, premium_economy: 0, business: 0, first: 0 } },
  };

  await db.collection(COLLECTION).doc(user.id).set(accountData);
  return { userId: user.id };
}

export async function deleteAccount(userId) {
  const db = getDb();
  await db.collection(COLLECTION).doc(userId).delete();
}

export async function getOrCreateAccount(userId) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(userId).get();
  if (doc.exists) return doc.data();
  const fallback = {
    userId, displayName: "Unknown",
    membership: { tier: "Frequent Traveller", statusPoints: 0, qualifyingPoints: 0, honPoints: 0, lifetimeStatusPoints: 0, totalFlights: 0, totalDistanceKm: 0, lastEarningDate: null, qualificationPeriod: { startDate: null, endDate: null, pointsThisPeriod: 0 }, tierHistory: [] },
    awards: { awardMiles: { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 }, loyalty: { bonusMiles: 0, membershipBonus: 0, statusBonus: 0, eventBonus: 0 } },
    history: { totalFlights: 0, cabinBreakdown: { economy: 0, premium_economy: 0, business: 0, first: 0 } },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection(COLLECTION).doc(userId).set(fallback);
  return fallback;
}

export async function getMemberAccount(userId) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(userId).get();
  if (!doc.exists) throw new Error("Account not found. Use /sign-up to register.");
  return doc.data();
}

export function getTierByPoints(points) {
  if (points >= 6000) return "HON Circle";
  if (points >= 2000) return "Senator";
  return "Frequent Traveller";
}

export function getNextTier(current) {
  if (current === "Frequent Traveller") return TIERS.Senator;
  if (current === "Senator") return TIERS["HON Circle"];
  return null;
}

export function getTierProgress(tier) {
  const t = TIERS[tier] || TIERS["Frequent Traveller"];
  const next = getNextTier(tier);
  if (!next) return { current: t.statusPoints, target: t.statusPoints, progress: 100, nextTier: null };
  return { current: t.statusPoints, target: next.statusPoints, progress: Math.min(100, Math.round((t.statusPoints / next.statusPoints) * 100)), nextTier: next.label };
}

export const DB_COLLECTIONS = {
  members: "members",
  mileageLedger: "mileageLedger",
  claims: "claims",
  redemptions: "redemptions",
  rewardsCatalog: "rewardsCatalog",
  achievements: "achievements",
  dailyClaims: "dailyClaims",
  events: "events",
  routes: "routes",
  promotions: "promotions",
  alliances: "alliances",
  airlineMembers: "airlineMembers",
  config: "config",
};

export default { signUpClient, deleteAccount, getOrCreateAccount, getMemberAccount, getTierByPoints, getNextTier, getTierProgress, TIERS, DB_COLLECTIONS };