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
  const account = await getMemberAccount(userId);
  const reward = await getReward(rewardId);
  if (!reward) throw new Error("Reward not found");
  if (reward.status !== "active") throw new Error("Reward not available");

  const balance = account.awards?.awardMiles?.balance || 0;
  if (reward.price > balance) throw new Error(`Insufficient miles. Need ${reward.price}, have ${balance}.`);

  // Check stock
  if (reward.stock !== null) {
    const usedSnap = await db.collection("redemptions").where("rewardId", "==", rewardId).where("status", "==", "fulfilled").get();
    if (usedSnap.size >= reward.stock) throw new Error("Reward out of stock");
  }

  // Idempotency key
  const idempotencyKey = `redeem:${userId}:${rewardId}:${Date.now()}`;
  const existing = await db.collection("redemptions").where("idempotencyKey", "==", idempotencyKey).limit(1).get();
  if (!existing.empty) throw new Error("Duplicate redemption");

  const redemptionId = db.collection("redemptions").doc().id;
  await db.collection("redemptions").doc(redemptionId).set({
    id: redemptionId, userId, rewardId, reward: { name: reward.name, price: reward.price, category: reward.category },
    status: "pending", milesDeducted: reward.price, idempotencyKey, createdAt: new Date(),
  });

  // Deduct miles
  await db.collection("members").doc(userId).update({
    "awards.awardMiles.balance": balance - reward.price,
    "awards.awardMiles.lifetimeSpent": (account.awards?.awardMiles?.lifetimeSpent || 0) + reward.price,
  });

  // Log transaction
  await db.collection("mileageLedger").add({
    userId, type: "spending", transactionType: "redemption", amount: -reward.price,
    reason: `Redemption: ${reward.name}`, referenceId: redemptionId, appliedAt: new Date(),
  });

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
  await db.collection("redemptions").doc(redemptionId).update({
    status: "fulfilled", fulfilledBy, fulfilledAt: new Date(),
  });
}

export async function refundRedemption({ redemptionId, reason }) {
  const db = getDb();
  const redSnap = await db.collection("redemptions").doc(redemptionId).get();
  if (!redSnap.exists) throw new Error("Redemption not found");
  const red = redSnap.data();

  await db.collection("redemptions").doc(redemptionId).update({ status: "refunded", refundedAt: new Date(), refundReason: reason });

  const account = await getMemberAccount(red.userId);
  const newBalance = (account.awards?.awardMiles?.balance || 0) + red.milesDeducted;
  await db.collection("members").doc(red.userId).update({
    "awards.awardMiles.balance": newBalance,
    "awards.awardMiles.lifetimeEarned": (account.awards?.awardMiles?.lifetimeEarned || 0) + red.milesDeducted,
  });

  await db.collection("mileageLedger").add({
    userId: red.userId, type: "earning", transactionType: "refund", amount: red.milesDeducted,
    reason: `Refund: ${reason}`, referenceId: redemptionId, appliedAt: new Date(),
  });
}

export async function listPendingRedemptions() {
  const db = getDb();
  const snap = await db.collection("redemptions").where("status", "==", "pending").orderBy("createdAt", "desc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export default { addReward, removeReward, listRewards, getReward, redeem, fulfillRedemption, refundRedemption, listPendingRedemptions };