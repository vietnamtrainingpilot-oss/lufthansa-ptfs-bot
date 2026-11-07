/**
 * catalogue.js — Loyalty redemption catalogue and VJ Credits shop.
 *
 * One collection `catalogueItems` with an explicit `currency` discriminator
 * ("points" | "credits") rather than two near-identical collections. Items are
 * server-authoritative: the browser never supplies a price, eligibility or
 * stock figure — those are always read from Firestore inside the transaction.
 *
 * Purchase/redemption is atomic:
 *   transaction {
 *     - idempotency doc must not already exist  (exactly-once)
 *     - item must be active + in stock
 *     - member must be eligible
 *     - balance must be sufficient
 *     - deduct balance, decrement stock, write redemption/purchase + ledger
 *   }
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import { CURRENCY } from "../config/loyaltyConfig.js";
import { TX_TYPE, applyLedgerEntry, readAccount, writeAudit, getLastTransactionMs, countRecentTransactions } from "./ledger.js";
import { getLoyaltyConfig } from "./loyaltyStore.js";
import { computeTier } from "./tierRules.js";

const ITEMS = "catalogueItems";
const REDEMPTIONS = "redemptions";

export const FULFILMENT = {
  INSTANT: "instant", // granted immediately (e.g. title/badge text)
  STAFF_QUEUE: "staff_queue", // needs a human to action it
};

export const ITEM_STATUS = { PENDING: "pending", FULFILLED: "fulfilled", REFUNDED: "refunded", CANCELLED: "cancelled" };

/**
 * Create or update a catalogue item (staff only).
 */
export async function upsertItem(item, staffId) {
  const db = getDb();
  const id = item.id || db.collection(ITEMS).doc().id;
  const ref = db.collection(ITEMS).doc(id);

  const doc = {
    id,
    displayName: String(item.displayName || "").slice(0, 80),
    description: String(item.description || "").slice(0, 500),
    currency: item.currency === CURRENCY.CREDITS ? CURRENCY.CREDITS : CURRENCY.POINTS,
    price: Math.max(0, Math.floor(Number(item.price) || 0)),
    active: item.active !== false,
    stock: item.stock === null || item.stock === undefined ? null : Math.max(0, Math.floor(Number(item.stock))),
    eligibility: item.eligibility || null, // e.g. { minTierKey: "adventurer" }
    fulfillment: item.fulfillment === FULFILMENT.INSTANT ? FULFILMENT.INSTANT : FULFILMENT.STAFF_QUEUE,
    createdAt: item.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: staffId,
  };

  if (!doc.displayName) throw new Error("displayName is required");
  await ref.set(doc, { merge: true });
  return doc;
}

export async function getItem(itemId) {
  const db = getDb();
  const snap = await db.collection(ITEMS).doc(itemId).get();
  return snap.exists ? snap.data() : null;
}

export async function listItems({ currency = null, activeOnly = true } = {}) {
  const db = getDb();
  let q = db.collection(ITEMS);
  if (currency) q = q.where("currency", "==", currency);
  const snap = await q.get();
  let items = snap.docs.map((d) => d.data());
  if (activeOnly) items = items.filter((i) => i.active);
  return items.sort((a, b) => a.price - b.price);
}

/**
 * Eligibility check. `minTierKey` requires the member to hold at least that tier.
 */
export function checkEligibility(item, account, config) {
  if (!item.active) return { ok: false, reason: "Item is not currently available." };
  if (item.stock !== null && item.stock <= 0) return { ok: false, reason: "Item is out of stock." };

  const minTier = item.eligibility?.minTierKey;
  if (minTier) {
    const tier = computeTier(account, config);
    const order = (config.tiers.list || []).map((t) => t.key);
    if (order.indexOf(tier.key) < order.indexOf(minTier)) {
      return { ok: false, reason: `Requires ${minTier} status or higher.` };
    }
  }
  return { ok: true };
}

/**
 * Redeem (points) or purchase (credits) an item.
 *
 * Atomicity: the balance change, its ledger entry, the stock decrement and the
 * redemption record are all staged inside ONE Firestore transaction, via the
 * `extraWrites` hook on applyLedgerEntry. The balance is never written outside
 * that transaction, so a member is charged exactly once and the ledger can
 * never disagree with the stored account.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.itemId
 * @param {string} params.idempotencyKey — unique per attempt
 * @param {number} [params.nowMs] — injectable clock for tests
 */
export async function transactItem({ userId, itemId, idempotencyKey, nowMs = Date.now() }) {
  if (!idempotencyKey) throw new Error("idempotencyKey required");
  const db = getDb();
  const config = await getLoyaltyConfig();

  // Idempotency + cooldown + daily cap.
  const redRef = db.collection(REDEMPTIONS).doc(idempotencyKey);
  const existing = await redRef.get();
  if (existing.exists) {
    return { ok: true, duplicate: true, message: "This request was already processed.", redemptionId: idempotencyKey, ...existing.data() };
  }

  const lastMs = await getLastTransactionMs(userId);
  const cooldown = Number(config.catalogue?.transactionCooldownMs || 0);
  if (cooldown > 0 && lastMs && nowMs - lastMs < cooldown) {
    const waitMs = cooldown - (nowMs - lastMs);
    const err = new Error(`Please wait ${Math.ceil(waitMs / 1000)}s before your next transaction.`);
    err.code = "COOLDOWN";
    throw err;
  }
  const todayCount = await countRecentTransactions(userId, 86400000);
  if (todayCount >= Number(config.catalogue?.maxTransactionsPerUserPerDay || 20)) {
    const err = new Error("Daily transaction limit reached. Try again tomorrow.");
    err.code = "RATE_LIMIT";
    throw err;
  }

  const item = await getItem(itemId);
  if (!item) {
    const err = new Error("Item not found.");
    err.code = "NOT_FOUND";
    throw err;
  }

  const currency = item.currency;

  // Fast-fail with a friendly message before opening the transaction. The
  // authoritative re-check happens inside the transaction below.
  const account = await readAccount(userId);
  const elig = checkEligibility(item, account, config);
  if (!elig.ok) {
    const err = new Error(elig.reason);
    err.code = "INELIGIBLE";
    throw err;
  }

  const field = currency === CURRENCY.CREDITS ? "credits" : "balance";
  const balance = Number(account[field] ?? 0);
  if (balance < item.price) {
    const err = new Error(`Insufficient balance. Need ${item.price}, have ${balance}.`);
    err.code = "INSUFFICIENT_FUNDS";
    throw err;
  }

  // One transaction: balance + ledger + stock + redemption record.
  const ledgerResult = await applyLedgerEntry({
    userId,
    currency,
    amount: -item.price,
    type: currency === CURRENCY.CREDITS ? TX_TYPE.PURCHASE : TX_TYPE.REDEMPTION,
    reason: `${item.displayName}`,
    idempotencyKey: `cat:${idempotencyKey}`,
    actorId: null,
    referenceType: "catalogueItem",
    referenceId: itemId,
    metadata: { itemName: item.displayName },
    extraWrites: async (tx, ctx) => {
      // Re-read the item authoritatively inside the transaction.
      const itemRef = db.collection(ITEMS).doc(itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists) throw Object.assign(new Error("Item not found."), { code: "NOT_FOUND" });
      const fresh = itemSnap.data();

      // The price/currency we are about to charge against must still be the
      // authoritative one; otherwise the caller should retry with fresh data.
      if (fresh.currency !== currency || Number(fresh.price) !== Number(item.price)) {
        throw Object.assign(new Error("This item changed. Please try again."), { code: "ITEM_CHANGED" });
      }
      if (!fresh.active) throw Object.assign(new Error("Item is not currently available."), { code: "INELIGIBLE" });
      if (fresh.stock !== null && fresh.stock <= 0) {
        throw Object.assign(new Error("Item is out of stock."), { code: "OUT_OF_STOCK" });
      }

      // Re-validate eligibility against the account read in this transaction.
      const inTx = checkEligibility(fresh, ctx.account, config);
      if (!inTx.ok) throw Object.assign(new Error(inTx.reason), { code: "INELIGIBLE" });

      // Reserve/decrement stock transactionally.
      if (fresh.stock !== null && fresh.stock !== undefined) {
        tx.update(itemRef, { stock: fresh.stock - 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }

      tx.create(redRef, {
        userId: String(userId),
        itemId,
        itemName: fresh.displayName,
        currency: fresh.currency,
        price: fresh.price,
        status: fresh.fulfillment === FULFILMENT.INSTANT ? ITEM_STATUS.FULFILLED : ITEM_STATUS.PENDING,
        fulfillment: fresh.fulfillment,
        idempotencyKey,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { itemName: fresh.displayName, price: fresh.price, currency: fresh.currency, fulfillment: fresh.fulfillment };
    },
  });

  if (ledgerResult.duplicate) {
    const prior = await redRef.get();
    const d = prior.exists ? prior.data() : {};
    return {
      ok: true,
      duplicate: true,
      message: "This request was already processed.",
      redemptionId: idempotencyKey,
      itemName: d.itemName,
      price: d.price,
      currency: d.currency,
      fulfillment: d.fulfillment,
    };
  }

  const data = ledgerResult.extra || { itemName: item.displayName, price: item.price, currency, fulfillment: item.fulfillment };

  return {
    ok: true,
    duplicate: false,
    redemptionId: idempotencyKey,
    balance: ledgerResult.balance,
    ...data,
    message:
      data.fulfillment === FULFILMENT.INSTANT
        ? `${data.itemName} granted.`
        : `${data.itemName} submitted. The request is waiting for staff fulfillment.`,
  };
}

/**
 * Staff fulfils a pending redemption.
 */
export async function fulfillRedemption(redemptionId, staffId) {
  const db = getDb();
  const ref = db.collection(REDEMPTIONS).doc(redemptionId);
  await ref.set(
    { status: ITEM_STATUS.FULFILLED, fulfilledById: staffId, fulfilledAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/**
 * Refund a redemption/purchase. Creates a compensating ledger entry; the
 * original transaction is never deleted.
 */
export async function refundRedemption(redemptionId, staffId, reason) {
  if (!reason) throw new Error("A reason is required to refund.");
  const db = getDb();
  const snap = await db.collection(REDEMPTIONS).doc(redemptionId).get();
  if (!snap.exists) throw new Error("Redemption not found.");
  const data = snap.data();
  if (data.status === ITEM_STATUS.REFUNDED) return { ok: false, reason: "Already refunded." };

  // Compensating credit back.
  await applyLedgerEntry({
    userId: data.userId,
    currency: data.currency,
    amount: Math.abs(data.price),
    type: TX_TYPE.REFUND,
    reason: `Refund: ${reason}`,
    idempotencyKey: `refund:${redemptionId}`,
    actorId: staffId,
    referenceType: "redemption",
    referenceId: redemptionId,
    metadata: { originalItemName: data.itemName },
  });

  // Return stock if the item had stock.
  if (data.itemId) {
    const itemRef = db.collection(ITEMS).doc(data.itemId);
    await db.runTransaction(async (tx) => {
      const itemSnap = await tx.get(itemRef);
      if (itemSnap.exists && itemSnap.data().stock !== null) {
        tx.update(itemRef, { stock: itemSnap.data().stock + 1 });
      }
    });
  }

  await ref.set(
    { status: ITEM_STATUS.REFUNDED, refundedById: staffId, refundedAt: admin.firestore.FieldValue.serverTimestamp(), refundReason: reason },
    { merge: true }
  );

  await writeAudit({
    actorId: staffId,
    action: "refundRedemption",
    targetUserId: data.userId,
    amount: data.price,
    currency: data.currency,
    reason,
    referenceType: "redemption",
    referenceId: redemptionId,
  });

  return { ok: true };
}

export default {
  FULFILMENT,
  ITEM_STATUS,
  upsertItem,
  getItem,
  listItems,
  checkEligibility,
  transactItem,
  fulfillRedemption,
  refundRedemption,
};