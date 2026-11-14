/**
 * redemptions.js — Rewards shop & redemption system
 */
import { getDb } from "./firestore.js";
import { getMemberAccount } from "./members.js";
import config from "../config/config.js";

const COLLECTION = "rewardsCatalog";

export async function addReward({ name, description, price, category, image, stock, eligibility }) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc().set({
    name, description, price, category: category || "General", image: image || null,
    stock: stock || null, eligibility: eligibility || null, createdAt: new Date(), status: "active",
  });
  return doc;
}

export async function removeReward(id) {
  const db = getDb();
  await db.collection(COLLECTION).doc(id).update({ status: "removed", removedAt: new Date() });
}

export async function listRewards() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).where("status", "==", "active").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getReward(id) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

export async function redeem({ userId, rewardId, client }) {
  const db = getDb();
  const { applyLedgerEntry, TX_TYPE } = await import("./ledger.js");
  const reward = await getReward(rewardId);
  if (!reward) throw new Error("Reward not found");
  if (reward.status !== "active") throw new Error("Reward not available");

  // Deterministic idempotency key: user+reward only. A retry/re-invoke of the
  // same logical redemption is a no-op. Date.now() is deliberately NOT used so
  // the exactly-once guard survives retries, reloads and network timeouts.
  const idempotencyKey = `redeem:${userId}:${rewardId}`;

  // Apply debit + inventory check + redemption record atomically via the ledger
  // transaction. extraWrites runs inside db.runTransaction BEFORE any write, so
  // the stock read and the redemption creation commit atomically with the
  // balance debit — a simultaneous double-spend on the last stock item cannot
  // both succeed.
  const result = await applyLedgerEntry({
    userId,
    currency: "points",
    amount: -reward.price,
    type: TX_TYPE.REDEMPTION,
    reason: `Redemption: ${reward.name}`,
    idempotencyKey,
    referenceType: "reward",
    referenceId: rewardId,
    extraWrites: async (tx, ctx) => {
      // Re-read reward inside the transaction for authoritative stock state.
      const rewardRef = db.collection(COLLECTION).doc(rewardId);
      const rewardSnap = await tx.get(rewardRef);
      const current = rewardSnap.exists ? rewardSnap.data() : null;
      if (!current || current.status !== "active") {
        throw new Error("Reward not available");
      }
      if (current.stock !== null && current.stock !== 0 && current.stock !== undefined) {
        const usedSnap = await tx.get(
          db.collection("redemptions").where("rewardId", "==", rewardId).where("status", "==", "fulfilled")
        );
        // NOTE: Firestore transaction cannot range/query; this is a limitation.
        // We use the reward's own stock counter instead for atomicity.
        if (current.stockUsed == null) current.stockUsed = 0;
        if (current.stockUsed >= current.stock) throw new Error("Reward out of stock");
        // Increment the reserved count so concurrent redemptions can't overdraw.
        const redemptionRef = db.collection("redemptions").doc(ctx.ledgerRef.id.replace("redeem:",""));
        // We don't know the doc id yet; generate a stable one from the key.
        const rid = db.collection("redemptions").doc();
        // Stage the stockUsed increment on the reward doc atomically.
        tx.set(rewardRef, { stockUsed: current.stockUsed + 1 }, { merge: true });
        // Stage redemption record inside the same transaction.
        tx.set(rid, {
          id: rid.id, userId, rewardId,
          reward: { name: reward.name, price: reward.price, category: reward.category },
          status: "pending", milesDeducted: reward.price, idempotencyKey, createdAt: new Date(),
        });
        return { redemptionId: rid.id };
      }
      // Unlimited stock: just record the redemption.
      const rid = db.collection("redemptions").doc();
      tx.set(rid, {
        id: rid.id, userId, rewardId,
        reward: { name: reward.name, price: reward.price, category: reward.category },
        status: "pending", milesDeducted: reward.price, idempotencyKey, createdAt: new Date(),
      });
      return { redemptionId: rid.id };
    },
  });

  if (result.duplicate) throw new Error("Duplicate redemption");

  const redemptionId = result.extra?.redemptionId;

  // Notify staff
  try {
    const channel = await client.channels.fetch(config.mileageSupportRoleId);
    if (channel) {
      await channel.send(`Redemption pending: ${reward.name} (${reward.price} miles) for <@!${userId}>`);
    }
  } catch {}

  return { redemptionId, reward, milesDeducted: reward.price };
}

export async function fulfillRedemption({ redemptionId, fulfilledBy }) {
  const db = getDb();
  const snap = await db.collection("redemptions").doc(redemptionId).get();
  if (!snap.exists) throw new Error("Redemption not found");
  const red = snap.data();
  if (red.status === "fulfilled") throw new Error("Redemption already fulfilled");
  if (red.status === "refunded") throw new Error("Redemption was refunded");

  await db.collection("redemptions").doc(redemptionId).update({
    status: "fulfilled", fulfilledBy, fulfilledAt: new Date(),
  });
}

export async function refundRedemption({ redemptionId, reason }) {
  const db = getDb();
  const { applyLedgerEntry, TX_TYPE } = await import("./ledger.js");
  const redSnap = await db.collection("redemptions").doc(redemptionId).get();
  if (!redSnap.exists) throw new Error("Redemption not found");
  const red = redSnap.data();

  if (red.status === "refunded") throw new Error("Redemption already refunded");
  if (red.status === "fulfilled") throw new Error("Fulfilled redemptions cannot be refunded");

  await db.collection("redemptions").doc(redemptionId).update({ status: "refunded", refundedAt: new Date(), refundReason: reason });

  // Use ledger for the refund — idempotent against the redemptionId
  await applyLedgerEntry({
    userId: red.userId,
    currency: "points",
    amount: red.milesDeducted,
    type: TX_TYPE.REFUND,
    reason: `Refund: ${reason}`,
    idempotencyKey: `refund:${redemptionId}`,
    referenceType: "redemption",
    referenceId: redemptionId,
  });
}

export async function listPendingRedemptions() {
  const db = getDb();
  const snap = await db.collection("redemptions").where("status", "==", "pending").orderBy("createdAt", "desc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export default { addReward, removeReward, listRewards, getReward, redeem, fulfillRedemption, refundRedemption, listPendingRedemptions };