/**
 * firestore.js — Firebase Admin SDK client.
 * Initializes once and exports a singleton db instance.
 */

import admin from "firebase-admin";
import config from "../config/config.js";

let db = null;

export function initFirestore() {
  if (db) return db;

  const privateKey = config.firebasePrivateKey.replace(/\\n/g, "\n");

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebaseProjectId,
      clientEmail: config.firebaseClientEmail,
      privateKey,
    }),
  });

  db = admin.firestore();
  console.log("[firestore] Connected to project:", config.firebaseProjectId);
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error(
      "[firestore] Database not initialized. Call initFirestore() first."
    );
  }
  return db;
}

/**
 * Test seam: inject a Firestore-compatible double instead of the real client.
 * Used by the unit tests so no live member balances are ever touched.
 * Pass null to restore the real client.
 */
export function __setDbForTesting(fake) {
  db = fake;
}

export default { initFirestore, getDb, __setDbForTesting };