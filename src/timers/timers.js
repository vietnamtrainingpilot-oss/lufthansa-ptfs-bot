/**
 * timers.js — Firestore-backed timer system.
 *
 * ALL timed actions are Firestore-backed, never a bare setTimeout/setInterval alone.
 * Timers live in the `timers` collection:
 *   { type, dueAt (timestamp), guildId, payload (map), fired: bool }
 *
 * A poller runs every TIMER_POLL_INTERVAL_SECONDS (default 30s), queries
 * `fired == false AND dueAt <= now`, executes, and marks fired.
 * The poller ALSO runs once on bot startup to catch anything missed during downtime.
 */

import admin from "firebase-admin";
import { getDb } from "../services/firestore.js";
import config from "../config/config.js";

const COLLECTION = "timers";
const POLL_INTERVAL_MS = (config.timerPollIntervalSeconds || 30) * 1000;

let pollHandle = null;
let running = false;

/**
 * Create a timer document.
 *
 * @param {object} params
 * @param {string} params.type
 * @param {Date} params.dueAt
 * @param {string} params.guildId
 * @param {object} params.payload
 * @returns {Promise<string>} timerId
 */
export async function createTimer({ type, dueAt, guildId, payload }) {
  const db = getDb();
  const doc = {
    type,
    dueAt:
      dueAt instanceof Date
        ? admin.firestore.Timestamp.fromDate(dueAt)
        : admin.firestore.Timestamp.fromDate(new Date(dueAt)),
    guildId,
    payload: payload || {},
    fired: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await db.collection(COLLECTION).add(doc);
  return ref.id;
}

/**
 * Mark a timer as fired (or cancelled).
 *
 * @param {string} timerId
 * @param {boolean} fired
 * @returns {Promise<void>}
 */
export async function markTimerFired(timerId, fired = true) {
  const db = getDb();
  await db.collection(COLLECTION).doc(timerId).update({ fired });
}

/**
 * Query for all unfired timers whose dueAt has passed.
 * Returns array of { id, ...data }.
 *
 * @returns {Promise<Array>}
 */
export async function getDueTimers() {
  const db = getDb();
  const now = admin.firestore.Timestamp.fromDate(new Date());
  const snap = await db
    .collection(COLLECTION)
    .where("fired", "==", false)
    .where("dueAt", "<=", now)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Execute a single timer's payload based on its type.
 * Handlers are registered via registerHandler().
 */
const handlers = new Map();

export function registerHandler(type, fn) {
  handlers.set(type, fn);
}

async function executeTimer(timer) {
  const handler = handlers.get(timer.type);
  if (!handler) {
    console.warn(`[timers] No handler registered for type: ${timer.type}`);
    await markTimerFired(timer.id, true);
    return;
  }
  try {
    await handler(timer);
    await markTimerFired(timer.id, true);
  } catch (e) {
    console.error(
      `[timers] Handler failed for timer ${timer.id} (${timer.type}):`,
      e.message
    );
    // Leave unfired so the poller retries on the next cycle.
  }
}

/**
 * Poll once — fetch due timers and execute them.
 * Safe to call repeatedly.
 */
export async function pollTimers() {
  if (running) return;
  running = true;
  try {
    const due = await getDueTimers();
    if (due.length > 0) {
      console.log(`[timers] Found ${due.length} due timer(s)`);
    }
    for (const timer of due) {
      await executeTimer(timer);
    }
  } catch (e) {
    console.error("[timers] pollTimers error:", e.message);
  } finally {
    running = false;
  }
}

/**
 * Start the periodic poller. Also runs an immediate catch-up poll.
 */
export function startTimerPoller() {
  if (pollHandle) return;
  // Immediate catch-up for timers missed during downtime.
  pollTimers().catch((e) =>
    console.error("[timers] Initial catch-up poll failed:", e.message)
  );
  pollHandle = setInterval(() => {
    pollTimers().catch((e) =>
      console.error("[timers] Periodic poll failed:", e.message)
    );
  }, POLL_INTERVAL_MS);
  console.log(`[timers] Poller started (interval: ${POLL_INTERVAL_MS}ms)`);
}

export function stopTimerPoller() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
    console.log("[timers] Poller stopped");
  }
}

export default {
  createTimer,
  markTimerFired,
  getDueTimers,
  registerHandler,
  startTimerPoller,
  stopTimerPoller,
};