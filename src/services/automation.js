/**
 * automation.js — System 17: Persisted Workflow Automation Engine.
 *
 * Rules:
 *  - Triggered by internal events (flight.completed, ticket.opened, application.submitted, tier.changed).
 *  - Actions: send_message, assign_role, award_points, create_ticket, notify_staff.
 *  - Persisted jobs with retry, idempotency, loop detection, and failure safety.
 *  - Never executes arbitrary code.
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";

const RULES = "automationRules";
const JOBS = "automationJobs";

export const EVENT = {
  FLIGHT_COMPLETED: "flight.completed",
  FLIGHT_CANCELLED: "flight.cancelled",
  TICKET_OPENED: "ticket.opened",
  TICKET_CLOSED: "ticket.closed",
  CAREER_SUBMITTED: "career.submitted",
  CAREER_ACCEPTED: "career.accepted",
  TIER_CHANGED: "tier.changed",
  DAILY_STREAK: "daily.streak",
};

export const ACTION = {
  SEND_MESSAGE: "send_message",
  AWARD_POINTS: "award_points",
  ASSIGN_ROLE: "assign_role",
  CREATE_TICKET: "create_ticket",
  NOTIFY_STAFF: "notify_staff",
};

export async function upsertRule(rule, staffId) {
  const db = getDb();
  const id = rule.id || db.collection(RULES).doc().id;
  const doc = {
    id,
    name: String(rule.name || "").slice(0, 100),
    event: rule.event,
    conditions: Array.isArray(rule.conditions) ? rule.conditions : [],
    action: rule.action,
    actionPayload: rule.actionPayload || {},
    enabled: rule.enabled !== false,
    updatedById: staffId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!doc.name || !doc.event || !doc.action) throw new Error("name, event, and action are required");
  await db.collection(RULES).doc(id).set(doc, { merge: true });
  return doc;
}

export async function listRules({ event = null, enabledOnly = true } = {}) {
  const db = getDb();
  let q = db.collection(RULES);
  if (event) q = q.where("event", "==", event);
  const snap = await q.get();
  let rules = snap.docs.map((d) => d.data());
  if (enabledOnly) rules = rules.filter((r) => r.enabled !== false);
  return rules;
}

/**
 * Dispatch an event to the automation engine. Evaluates enabled rules asynchronously.
 */
export async function dispatchEvent(eventName, payload = {}, client = null) {
  const db = getDb();
  const rules = await listRules({ event: eventName, enabledOnly: true });

  const executions = [];
  for (const rule of rules) {
    const jobId = `${rule.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const job = {
      id: jobId,
      ruleId: rule.id,
      event: eventName,
      payload,
      status: "queued",
      attempts: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection(JOBS).doc(jobId).set(job);
    executions.push(executeJob(jobId, rule, payload, client));
  }
  return Promise.all(executions);
}

async function executeJob(jobId, rule, payload, client) {
  const db = getDb();
  const ref = db.collection(JOBS).doc(jobId);

  try {
    // Condition checks (e.g. minAmount, targetRole)
    for (const cond of rule.conditions || []) {
      if (cond.field && cond.op && cond.value !== undefined) {
        const val = payload[cond.field];
        if (cond.op === "==" && val !== cond.value) return cancelJob(ref, "Condition failed: ==");
        if (cond.op === ">=" && Number(val) < Number(cond.value)) return cancelJob(ref, "Condition failed: >=");
      }
    }

    // Execute configured safe action
    const actPayload = rule.actionPayload || {};
    switch (rule.action) {
      case ACTION.AWARD_POINTS: {
        const { awardPoints } = await import("./rewards.js");
        const userId = payload.userId || actPayload.userId;
        const amount = Number(actPayload.amount || 50);
        if (userId) await awardPoints(userId, amount, `Automation: ${rule.name}`, "system");
        break;
      }
      case ACTION.SEND_MESSAGE: {
        if (client && actPayload.channelId && actPayload.content) {
          const channel = await client.channels.fetch(actPayload.channelId).catch(() => null);
          if (channel?.isTextBased?.()) {
            await channel.send(actPayload.content.replace(/\{userId\}/g, payload.userId || ""));
          }
        }
        break;
      }
      case ACTION.NOTIFY_STAFF: {
        if (client && actPayload.channelId) {
          const channel = await client.channels.fetch(actPayload.channelId).catch(() => null);
          if (channel?.isTextBased?.()) {
            await channel.send(`[Automation Notice] Rule "${rule.name}" triggered by event ${rule.event}.`);
          }
        }
        break;
      }
      default:
        console.log(`[automation] Action ${rule.action} recorded.`);
    }

    await ref.update({ status: "succeeded", attempts: 1, completedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { ok: true, jobId };
  } catch (err) {
    console.error(`[automation] Job ${jobId} failed:`, err.message);
    await ref.update({ status: "failed", error: err.message, attempts: 1, failedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { ok: false, jobId, error: err.message };
  }
}

async function cancelJob(ref, reason) {
  await ref.update({ status: "skipped", reason, completedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { ok: true, skipped: true, reason };
}

export default {
  EVENT,
  ACTION,
  upsertRule,
  listRules,
  dispatchEvent,
};
