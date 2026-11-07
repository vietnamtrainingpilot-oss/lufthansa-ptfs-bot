/**
 * ledger.js — Transaction ledger and the ONLY sanctioned way to mutate a balance.
 *
 * Rules enforced here:
 *  - Every balance change writes an `economyLedger` entry in the SAME transaction.
 *  - Every mutation carries an idempotency key; the ledger document id IS the key,
 *    so a retry / duplicate webhook / re-run command cannot double-spend or
 *    double-award. The transaction aborts if the key already exists.
 *  - Normal member actions can never overdraw a balance.
 *  - Staff corrections create compensating entries; history is never erased.
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import { CURRENCY } from "../config/loyaltyConfig.js";

const ACCOUNTS = "rewardsAccounts";
const LEDGER = "economyLedger";
const AUDIT = "rewardAuditLog";

/** Normalised transaction types. Keep this list tight; it drives leaderboard/audit logic. */
export const TX_TYPE = {
  FLIGHT_EARN: "flightEarn",
  MISSION_EARN: "missionEarn",
  STAFF_AWARD: "staffAward",
  STAFF_DEDUCT: "staffDeduct",
  REDEMPTION: "redemption",
  PURCHASE: "purchase",
  REFUND: "refund",
  REVERSAL: "reversal",
  ADJUSTMENT: "adjustment",
};

const DEFAULT_ACCOUNT = {
  userId: null,
  balance: 0, // current spendable loyalty points (legacy field name, kept for compatibility)
  credits: 0, // current spendable VJ Credits
  lifetimePointsEarned: 0, // lifetime points from every source, never decreases
  qualifyingPoints: 0, // lifetime points from verified flights only — drives tiers
  qualifyingFlightCount: 0, // lifetime count of verified eligible flights
  tierKey: "explorer",
  level: 1, // legacy numeric mirror of tier index (kept for existing commands/roles)
  lastTransactionAtMs: 0,
  createdAt: null,
  updatedAt: null,
};

/**
 * Read a member account without creating it.
 */
export async function readAccount(userId) {
  const db = getDb();
  const snap = await db.collection(ACCOUNTS).doc(String(userId)).get();
  if (!snap.exists) return { ...DEFAULT_ACCOUNT, userId: String(userId) };
  return { ...DEFAULT_ACCOUNT, ...snap.data() };
}

/**
 * Create the account document if absent. Safe to call concurrently.
 */
export async function ensureAccount(userId) {
  const db = getDb();
  const docRef = db.collection(ACCOUNTS).doc(String(userId));
  const snap = await docRef.get();
  if (snap.exists) return { ...DEFAULT_ACCOUNT, ...snap.data() };
  await docRef.set({
    ...DEFAULT_ACCOUNT,
    userId: String(userId),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ...DEFAULT_ACCOUNT, userId: String(userId) };
}

function currencyField(currency) {
  return currency === CURRENCY.CREDITS ? "credits" : "balance";
}

/**
 * Apply a signed balance change atomically with its ledger entry.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {"points"|"credits"} params.currency
 * @param {number} params.amount — signed. Positive credits the member, negative debits.
 * @param {string} params.type — one of TX_TYPE
 * @param {string} params.reason — plain-text, safe for display
 * @param {string} params.idempotencyKey — unique per logical event
 * @param {string} [params.actorId] — Discord user id of staff, or null for system
 * @param {string} [params.referenceType] — e.g. "flight" | "mission" | "catalogueItem"
 * @param {string} [params.referenceId]
 * @param {object} [params.metadata] — safe-to-display context (no staff-only notes)
 * @param {object} [params.lifetime] — { pointsDelta, qualifyingPointsDelta, qualifyingFlightDelta }
 * @param {boolean} [params.allowOverdraw=false] — audited staff-only escape hatch
 * @param {Function} [params.extraWrites] — optional async (tx, ctx) hook that runs
 *   INSIDE the same transaction, after all reads and before any writes. ctx is
 *   { account, accountRef, ledgerRef, field, amount, userId }. Use it to read
 *   authoritative state and stage additional writes (e.g. decrement stock,
 *   create a redemption record) so the whole operation commits atomically.
 *   Throwing from the hook aborts the transaction, rolling back everything.
 * @returns {Promise<{applied:boolean, duplicate:boolean, account:object, entryId:string, balance:number, extra:any}>}
 */
export async function applyLedgerEntry(params) {
  const {
    userId,
    currency,
    amount,
    type,
    reason,
    idempotencyKey,
    actorId = null,
    referenceType = null,
    referenceId = null,
    metadata = null,
    lifetime = null,
    allowOverdraw = false,
    extraWrites = null,
  } = params;

  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    throw new Error("idempotencyKey is required");
  }
  if (!Number.isFinite(amount)) {
    throw new Error("amount must be a finite number");
  }
  if (currency !== CURRENCY.POINTS && currency !== CURRENCY.CREDITS) {
    throw new Error(`unknown currency: ${currency}`);
  }
  if (!type) throw new Error("type is required");

  const db = getDb();
  const uid = String(userId);
  const accountRef = db.collection(ACCOUNTS).doc(uid);
  const ledgerRef = db.collection(LEDGER).doc(idempotencyKey);
  const field = currencyField(currency);

  return db.runTransaction(async (tx) => {
    // Exactly-once guard: the ledger doc id is the idempotency key.
    const existing = await tx.get(ledgerRef);
    if (existing.exists) {
      const acc = await tx.get(accountRef);
      const data = acc.exists ? { ...DEFAULT_ACCOUNT, ...acc.data() } : { ...DEFAULT_ACCOUNT, userId: uid };
      return {
        applied: false,
        duplicate: true,
        account: data,
        entryId: idempotencyKey,
        balance: data[field] ?? 0,
        extra: null,
      };
    }

    const accSnap = await tx.get(accountRef);
    const before = accSnap.exists
      ? { ...DEFAULT_ACCOUNT, ...accSnap.data() }
      : { ...DEFAULT_ACCOUNT, userId: uid };

    // Caller-supplied work runs here: every read it needs is still ahead of the
    // first write, and anything it stages commits atomically with the balance
    // change and the ledger entry below.
    const extra = extraWrites
      ? await extraWrites(tx, { account: before, accountRef, ledgerRef, field, amount, userId: uid })
      : null;

    const beforeBalance = Number(before[field] ?? 0);
    let afterBalance = beforeBalance + amount;

    // Overdraw protection. Only an audited staff correction may go negative.
    if (afterBalance < 0) {
      if (!allowOverdraw) {
        const err = new Error(
          `insufficient ${currency}: balance ${beforeBalance}, requested ${amount}`
        );
        err.code = "INSUFFICIENT_FUNDS";
        throw err;
      }
    }
    if (afterBalance > 999999999) {
      const err = new Error("balance ceiling exceeded");
      err.code = "BALANCE_CEILING";
      throw err;
    }

    const lifetimePointsDelta = Number(lifetime?.pointsDelta ?? 0);
    const qualifyingPointsDelta = Number(lifetime?.qualifyingPointsDelta ?? 0);
    const qualifyingFlightDelta = Number(lifetime?.qualifyingFlightDelta ?? 0);

    const patch = {
      [field]: afterBalance,
      lastTransactionAtMs: Date.now(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!accSnap.exists) {
      patch.createdAt = admin.firestore.FieldValue.serverTimestamp();
      patch.userId = uid;
    }
    if (currency === CURRENCY.POINTS && lifetimePointsDelta !== 0) {
      patch.lifetimePointsEarned = Math.max(
        0,
        (Number(before.lifetimePointsEarned ?? 0) || 0) + lifetimePointsDelta
      );
    }
    if (lifetimePointsDelta !== 0 || qualifyingPointsDelta !== 0 || qualifyingFlightDelta !== 0) {
      patch.qualifyingPoints = Math.max(
        0,
        (Number(before.qualifyingPoints ?? 0) || 0) + qualifyingPointsDelta
      );
      patch.qualifyingFlightCount = Math.max(
        0,
        (Number(before.qualifyingFlightCount ?? 0) || 0) + qualifyingFlightDelta
      );
    }

    tx.set(accountRef, patch, { merge: true });

    tx.create(ledgerRef, {
      userId: uid,
      currency,
      amount,
      type,
      reason: String(reason || "").slice(0, 500),
      balanceAfter: afterBalance,
      balanceBefore: beforeBalance,
      actorId,
      referenceType,
      referenceId,
      idempotencyKey,
      metadata: metadata || null,
      lifetimePointsDelta,
      qualifyingPointsDelta,
      qualifyingFlightDelta,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const after = { ...before, ...patch };
    return {
      applied: true,
      duplicate: false,
      account: after,
      entryId: idempotencyKey,
      balance: afterBalance,
      extra,
    };
  });
}

/**
 * Record a staff/administrative action in the audit log.
 * Separate from the ledger: audit records configuration and override events.
 */
export async function writeAudit({ actorId, action, targetUserId = null, amount = null, currency = null, reason, before = null, after = null, referenceType = null, referenceId = null }) {
  const db = getDb();
  const ref = db.collection(AUDIT).doc();
  await ref.set({
    actorId: actorId || null,
    action,
    targetUserId,
    amount: amount ?? null,
    currency,
    reason: String(reason || "").slice(0, 500),
    before: before ?? null,
    after: after ?? null,
    referenceType,
    referenceId,
    at: admin.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Read a member's ledger history, newest first.
 * staffNotes/fraud flags are never stored here — only safe display metadata.
 */
export async function getHistory(userId, { limit = 25, currency = null } = {}) {
  const db = getDb();
  let q = db.collection(LEDGER).where("userId", "==", String(userId));
  if (currency) q = q.where("currency", "==", currency);
  const snap = await q.orderBy("at", "desc").limit(Math.min(Math.max(limit, 1), 100)).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Count a member's transactions in a rolling 24h window (rate limiting).
 */
export async function countRecentTransactions(userId, windowMs = 86400000) {
  const db = getDb();
  const since = new Date(Date.now() - windowMs);
  const snap = await db
    .collection(LEDGER)
    .where("userId", "==", String(userId))
    .where("at", ">=", admin.firestore.Timestamp.fromDate(since))
    .get();
  return snap.size;
}

/**
 * Last transaction timestamp (ms) for cooldown enforcement.
 */
export async function getLastTransactionMs(userId) {
  const acc = await readAccount(userId);
  return Number(acc.lastTransactionAtMs ?? 0);
}

export default {
  TX_TYPE,
  applyLedgerEntry,
  ensureAccount,
  readAccount,
  writeAudit,
  getHistory,
  countRecentTransactions,
  getLastTransactionMs,
};