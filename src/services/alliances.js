/**
 * alliances.js — Alliance management service for partner airline communities.
 */
import { getDb } from "./firestore.js";
import config from "../config/config.js";
import crypto from "crypto";

const COLLECTION = "alliances";
const MEMBERS_COLL = "allianceMembers";

export async function createAlliance({ name, description, logo, createdBy }) {
  const db = getDb();
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  const id = db.collection(COLLECTION).doc().id;
  await db.collection(COLLECTION).doc(id).set({
    id, name, description: description || "", logo: logo || null,
    inviteCode: code, leaderId: createdBy, guildId: config.guildIdMain,
    partnerRate: 80, // default 80% partner earning rate
    createdAt: new Date(), status: "active",
  });
  return { id, name, code };
}

export async function getAllianceById(id) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

export async function listAlliances() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).where("status", "==", "active").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function regenerateInviteCode(allianceId, requesterId) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).doc(allianceId).get();
  if (!snap.exists) throw new Error("Alliance not found");
  if (snap.data().leaderId !== requesterId) throw new Error("Only the alliance leader can regenerate the code");
  const newCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  await db.collection(COLLECTION).doc(allianceId).update({ inviteCode: newCode, codeRegeneratedAt: new Date() });
  return newCode;
}

export async function joinAlliance({ allianceId, code, serverId }) {
  const db = getDb();
  const allianceSnap = await db.collection(COLLECTION).doc(allianceId).get();
  if (!allianceSnap.exists) throw new Error("Alliance not found");
  const alliance = allianceSnap.data();
  if (alliance.status !== "active") throw new Error("Alliance is no longer active");
  if (alliance.inviteCode !== code.toUpperCase()) throw new Error("Invalid invitation code");
  if (alliance.guildId === serverId) throw new Error("This server is already a member");

  // Check existing membership
  const existing = await db.collection(MEMBERS_COLL)
    .where("allianceId", "==", allianceId)
    .where("guildId", "==", serverId)
    .limit(1).get();
  if (!existing.empty) throw new Error("This server has already joined");

  await db.collection(MEMBERS_COLL).add({
    allianceId, guildId: serverId, joinedAt: new Date(),
    role: "member", status: "active",
  });
  return { allianceId, guildId: serverId };
}

export async function leaveAlliance(serverId) {
  const db = getDb();
  const snap = await db.collection(MEMBERS_COLL).where("guildId", "==", serverId).get();
  if (snap.empty) throw new Error("Not a member of any alliance");
  for (const doc of snap.docs) {
    await doc.ref.update({ status: "left", leftAt: new Date() });
  }
}

export async function kickMember(allianceId, targetGuildId, staffId) {
  const db = getDb();
  const allianceSnap = await db.collection(COLLECTION).doc(allianceId).get();
  if (!allianceSnap.exists) throw new Error("Alliance not found");
  if (allianceSnap.data().leaderId !== staffId) throw new Error("Only the alliance leader can kick members");

  const memberSnap = await db.collection(MEMBERS_COLL)
    .where("allianceId", "==", allianceId).where("guildId", "==", targetGuildId).get();
  if (memberSnap.empty) throw new Error("Target not found in this alliance");

  for (const doc of memberSnap.docs) {
    await doc.ref.update({ status: "kicked", kickedAt: new Date() });
  }
}

export async function setPartnerRate(allianceId, rate, staffId) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).doc(allianceId).get();
  if (!snap.exists) throw new Error("Alliance not found");
  if (snap.data().leaderId !== staffId) throw new Error("Only the alliance leader can change settings");
  if (rate < 50 || rate > 150) throw new Error("Partner rate must be between 50% and 150%");
  await db.collection(COLLECTION).doc(allianceId).update({ partnerRate: rate, rateUpdatedAt: new Date() });
  return rate;
}

export async function getMemberAlliance(guildId) {
  const db = getDb();
  const snap = await db.collection(MEMBERS_COLL).where("guildId", "==", guildId).where("status", "!=", "left").limit(1).get();
  if (snap.empty) return null;
  const memberId = snap.docs[0].data();
  const allianceSnap = await db.collection(COLLECTION).doc(memberId.allianceId).get();
  if (!allianceSnap.exists) return null;
  return { ...allianceSnap.data(), memberRole: memberId.role };
}

export default {
  createAlliance, getAllianceById, listAlliances, regenerateInviteCode,
  joinAlliance, leaveAlliance, kickMember, setPartnerRate, getMemberAlliance,
};
