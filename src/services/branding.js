/**
 * branding.js — Lufthansa Miles & More branding configuration service.
 */
import { getDb } from "./firestore.js";
import config from "../config/config.js";

const COLLECTION = "branding";
const DEFAULTS = {
  primaryColor: "#FFAD00",
  secondaryColor: "#05164D",
  programmeName: "LH Rewards",
  footer: "Lufthansa PTFS — Unofficial virtual airline community.",
  emojiCheckIn: "",
  emojiMilestone: "",
  botNickname: "",
  logoUrl: "",
};

export async function getBrandingConfig() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).doc("server").get();
  if (snap.exists) return { ...DEFAULTS, ...snap.data() };
  return { ...DEFAULTS };
}

export async function setBrandingProperty(key, value, staffId) {
  const validKeys = [
    "primaryColor", "secondaryColor", "programmeName", "footer",
    "emojiCheckIn", "emojiMilestone", "botNickname", "logoUrl",
  ];
  if (!validKeys.includes(key)) throw new Error(`Invalid branding property: ${key}`);
  const db = getDb();
  await db.collection(COLLECTION).doc("server").set({ [key]: value, updatedAt: new Date(), updatedBy: staffId }, { merge: true });
}

export async function resetBranding(requireConfirm = false) {
  if (requireConfirm) return { reset: false, message: "Confirmation required" };
  const db = getDb();
  await db.collection(COLLECTION).doc("server").delete();
  return { reset: true };
}

export async function validateEmoji(emoji) {
  if (!emoji) return { valid: true };
  // Discord emoji format: <:name:id> or <a:name:id>
  const pattern = /^<a?:\w+:\d{17,20}>$/;
  if (!pattern.test(emoji)) return { valid: false, error: "Invalid emoji format" };
  return { valid: true };
}

export async function validateLogoUrl(url) {
  if (!url) return { valid: true };
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL" };
  }
}

export default {
  getBrandingConfig, setBrandingProperty, resetBranding, validateEmoji, validateLogoUrl,
};
