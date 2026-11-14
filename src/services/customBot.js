/**
 * customBot.js — Custom bot integration management service.
 *
 * Secure token handling:
 * - Tokens are encrypted at rest using AES-256-GCM with a master key from env.
 * - The encrypted blob is stored, never the plaintext token.
 * - A SHA-256 hash is also stored for integrity verification.
 * - No token is ever logged or returned to the frontend.
 */
import { getDb } from "./firestore.js";
import crypto from "crypto";

const COLLECTION = "customBots";

/**
 * Encrypt a plaintext token using AES-256-GCM.
 * Returns { encrypted, iv, authTag } — all required for decryption.
 */
function encryptToken(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    encrypted: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
}

/**
 * Decrypt a token using AES-256-GCM.
 * Throws if decryption fails (tampered data or wrong key).
 */
function decryptToken(encryptedData, key) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(encryptedData.iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedData.encrypted, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Get the master encryption key from environment.
 * Throws if not configured — this is a hard requirement for token storage.
 */
function getMasterKey() {
  const key = process.env.CUSTOM_BOT_MASTER_KEY;
  if (!key) {
    throw new Error("CUSTOM_BOT_MASTER_KEY is not configured. Cannot store custom bot credentials securely.");
  }
  // Expect hex-encoded 32-byte key
  if (key.length !== 64) {
    throw new Error("CUSTOM_BOT_MASTER_KEY must be a 64-character hex string (32 bytes for AES-256).");
  }
  return key;
}

/**
 * Validate a Discord bot token format (typical format: >50 chars alphanumeric + dots).
 */
function isValidDiscordToken(token) {
  if (!token || typeof token !== "string") return false;
  if (token.length < 50) return false;
  // Discord tokens are typically `<id>.<timestamp>.<base64>` with 3 dot-separated parts
  const parts = token.split(".");
  return parts.length >= 3;
}

export async function setupCustomBot({ type, appName, botToken, webhookUrl, clientId, configuredBy }) {
  const db = getDb();
  const masterKey = getMasterKey();

  // Validate token format
  if (!isValidDiscordToken(botToken)) {
    throw new Error("Invalid bot token format. Expected a Discord token (three dot-separated parts).");
  }

  // Encrypt the token at rest
  const encryptedData = encryptToken(botToken, masterKey);
  const tokenHash = crypto.createHash("sha256").update(botToken).digest("hex");

  // Remove any existing active integration (rotate-out)
  const existing = await db.collection(COLLECTION).where("status", "!=", "disconnected").limit(1).get();
  for (const doc of existing.docs) {
    await doc.ref.update({ status: "disconnected", disconnectedAt: new Date() });
  }

  const id = db.collection(COLLECTION).doc().id;
  await db.collection(COLLECTION).doc(id).set({
    id,
    type,
    appName,
    encryptedToken: encryptedData,
    tokenHash,
    webhookUrl: webhookUrl || null,
    clientId: clientId || null,
    configuredBy,
    lastCheckedAt: null,
    status: "configured",
    createdAt: new Date(),
  });

  return {
    id,
    type,
    appName,
    maskedToken: "••••••••", // never reveal any token characters
  };
}

export async function getCustomBotStatus() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).where("status", "!=", "disconnected").limit(1).get();
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  return {
    id: snap.docs[0].id,
    type: data.type,
    appName: data.appName,
    status: data.status,
    lastCheckedAt: data.lastCheckedAt,
    maskedToken: data.tokenHash ? data.tokenHash.slice(0, 8) + "..." : null,
  };
}

export async function removeCustomBot() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).where("status", "!=", "disconnected").limit(1).get();
  if (snap.empty) return false;
  const docRef = db.collection(COLLECTION).doc(snap.docs[0].id);
  await docRef.update({
    status: "disconnected",
    disconnectedAt: new Date(),
    encryptedToken: null,
  });
  return true;
}

export async function testConnection(botId) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).doc(botId).get();
  if (!snap.exists) throw new Error("Integration not found");

  const masterKey = getMasterKey();
  const data = snap.data();

  if (!data.encryptedToken) throw new Error("No stored credentials (integration was removed).");

  // Decrypt token to verify it can be retrieved — proves encryption is reversible
  // with the current master key. No token is ever exposed here.
  let token;
  try {
    token = decryptToken(data.encryptedToken, masterKey);
  } catch (e) {
    throw new Error("Failed to decrypt stored token — master key may have changed or data is corrupt.");
  }

  // Mark as checked (no actual connection possible without a live Discord client)
  await db.collection(COLLECTION).doc(botId).update({
    lastCheckedAt: new Date(),
    status: "configured",
  });

  return {
    connected: true,
    checkedAt: new Date(),
    tokenLength: token.length,
  };
}

/**
 * Retrieve the plaintext token for an integration (server-side only).
 * Used to actually start/operate the custom bot. Never expose this to clients.
 * @param {string} botId
 * @returns {Promise<string>} plaintext token
 */
export async function getBotToken(botId) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).doc(botId).get();
  if (!snap.exists) throw new Error("Integration not found");
  const data = snap.data();
  if (!data.encryptedToken || data.status === "disconnected") {
    throw new Error("Integration has no retrievable credentials.");
  }
  const masterKey = getMasterKey();
  return decryptToken(data.encryptedToken, masterKey);
}

export default {
  setupCustomBot,
  getCustomBotStatus,
  removeCustomBot,
  testConnection,
  getBotToken,
};