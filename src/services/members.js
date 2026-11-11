/**
 * members.js — Lufthansa Miles & More Member Account Service
 *
 * Core membership system:
 * - Account creation (sign-up)
 * - Profile management
 * - Membership tiers (Frequent Traveller, Senator, HON Circle)
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import config from "../config/config.js";
import { buildText, buildMessage } from "../utils/builders.js";

const COLLECTION = "members";
const ALLOWED_PASSWORD_MIN_LENGTH = 8;

/**
 * Register a new member account.
 *
 * @param {import('discord.js').User} user
 * @param {string} password
 * @returns {Promise<object>} Account data
 */
export async function signUpClient(user, password) {
  const db = getDb();

  // Check if account already exists
  const existing = (await db.collection(COLLECTION).where("userId", "==", user.id).get());
  if (!existing.empty) {
    throw new Error("Account already registered");
  }

  // Validate password
  if (password.length < ALLOWED_PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${ALLOWED_PASSWORD_MIN_LENGTH} characters`);
  }

  // Create initial account
  const accountData = {
    userId: user.id,
    passwordHash: hashPassword(password),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    membership: {
      tier: "Frequent Traveller",
      statusPoints: 0,
      qualifyingPoints: 0,
      honPoints: 0,
      tierProgress: [],
      lastEarningDate: null,
    },
    awards: {
      awardMiles: {
        balance: 0,
        lifetimeEarned: 0,
        lifetimeSpent: 0,
      },
      loyalty: {
        bonusMiles: 0,
        membershipBonus: 0,
        statusBonus: 0,
        eventBonus: 0,
      },
    },
  };

  const doc = await db.collection(COLLECTION).doc(user.id).set(accountData);
  return { docId: doc.id, ...accountData };
}

/**
 * Delete member account.
 * @param {string} userId
 */
export async function deleteAccount(userId) {
  const db = getDb();
  try {
    await db.collection(COLLECTION).doc(userId).delete();
    return true;
  } catch (e) {
    console.error("[members] Delete account failed:", e.message);
    throw e;
  }
}

/**
 * Get or create member account.
 */
export async function getOrCreateAccount(userId) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(userId).get();

  if (doc.exists) {
    return doc.data();
  }

  // Auto-create for first-time users who interacted
  return {
    userId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    membership: {
      tier: "Frequent Traveller",
      statusPoints: 0,
      qualifyingPoints: 0,
      honPoints: 0,
      tierProgress: [],
      lastEarningDate: null,
    },
    awards: {
      awardMiles: {
        balance: 0,
        lifetimeEarned: 0,
        lifetimeSpent: 0,
      },
      loyalty: {
        bonusMiles: 0,
        membershipBonus: 0,
        statusBonus: 0,
        eventBonus: 0,
      },
    },
  };
}

/**
 * Check password hash.
 */
export function hashPassword(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    const hshi = hash >> (i % 4 * 8);
    const hssi = hash & (0xff << (24 - i % 4 * 8));
    hash = hshi | hshi;
  }
  return hash.toString();
}

/**
 * Verify password.
 */
export function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

/**
 * Get membership tier by status points.
 */
export function getTierByPoints(statusPoints) {
  if (statusPoints >= 6000) return "HON Circle";
  if (statusPoints >= 2000) return "Senator";
  return "Frequent Traveller";
}

/**
 * Get tier config.
 */
export const TIERS = {
  "Frequent Traveller": {
    statusPoints: 0,
    qualifyingPoints: 0,
    benefits: [
      "Business Lounge access",
      "Business Class check-in",
      "Priority boarding",
      "Additional baggage allowance",
      "Exclusive events",
    ],
  },
  Senator: {
    statusPoints: 2000,
    qualifyingPoints: 1000,
    benefits: [
      "Senator & Star Alliance Gold Lounge access",
      "First Class check-in",
      "Priority boarding and boarding group",
      "Upgrade vouchers",
      "Dedicated check-in counters",
      "Complimentary seat selection",
    ],
  },
  "HON Circle": {
    statusPoints: 6000,
    qualifyingPoints: 1500,
    benefits: [
      "HON Circle lounge access",
      "First Class check-in",
      "Chauffeur and transfer service",
      "Personal HON Circle service",
      "Priority on award flight bookings",
      "Upgrade vouchers",
      "Complimentary upgrades",
    ],
  },
};

/**
 * Get member account data.
 */
export async function getMemberAccount(userId) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(userId).get();
  if (!doc.exists) {
    throw new Error("Account not found");
  }
  return doc.data();
}

export default {
  signUpClient,
  deleteAccount,
  getOrCreateAccount,
  getMemberAccount,
  verificationPassword,
  TIERS,
};