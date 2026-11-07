/**
 * flightRewards.js — Exactly-once verified flight reward workflow.
 *
 * Flow:
 *   1. Authorised staff confirms the flight is complete.
 *   2. Build a reward preview from the finalized manifest.
 *   3. On confirmation, award each eligible passenger exactly once.
 *
 * Exactly-once guarantees:
 *   - Per-passenger idempotency key = `${flightId}:${userId}:${rewardType}`,
 *     so re-running the command, a bot restart, or a duplicated webhook cannot
 *     award twice (the ledger doc id is the key).
 *   - A manifest-level `rewardsApplied` flag provides a second guard.
 *   - Staff corrections use `reconcileFlight`, which writes compensating
 *     (negative) ledger entries rather than editing history.
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import { CURRENCY } from "../config/loyaltyConfig.js";
import { TX_TYPE, applyLedgerEntry, writeAudit } from "./ledger.js";
import { calculateFlightReward } from "./rewardFormula.js";
import { summariseEligible, getManifest, markRewardsApplied, finalizeManifest } from "./manifest.js";
import { getLoyaltyConfig } from "./loyaltyStore.js";
import { resolveTier } from "./tiers.js";

/**
 * Build a preview of who would be rewarded and what they'd receive.
 * Read-only. Safe to call repeatedly.
 */
export async function buildRewardPreview(flight, { config = null, manifest = null } = {}) {
  const cfg = config || (await getLoyaltyConfig());
  const man = manifest || (await getManifest(flight.id));
  if (!man) {
    return { ok: false, error: "NO_MANIFEST", message: "No manifest exists for this flight. Add passengers before finalizing." };
  }
  if (man.rewardsApplied) {
    return { ok: false, error: "ALREADY_APPLIED", message: "Rewards have already been applied to this flight. Use reconcile if a correction is needed." };
  }

  const summary = summariseEligible(man, cfg);
  const awarded = [];
  const skipped = [];

  for (const p of summary.eligiblePassengers) {
    try {
      // Determine current tier for the status bonus.
      const tierKey = await resolveTier(p.userId, cfg);
      const reward = calculateFlightReward({
        flight,
        cabinClass: p.cabinClass,
        tierKey,
        config: cfg,
      });
      awarded.push({
        userId: p.userId,
        displayName: p.displayName,
        cabinClass: p.cabinClass,
        points: reward.points,
        credits: reward.credits,
        explanation: reward.explanation,
        breakdown: reward.breakdown,
      });
    } catch (e) {
      skipped.push({
        userId: p.userId,
        displayName: p.displayName,
        reason: e.code === "MISSING_FLIGHT_BASIS" ? "Flight data incomplete (staff correction required)" : e.message,
      });
    }
  }

  const totalPoints = awarded.reduce((s, a) => s + a.points, 0);
  const totalCredits = awarded.reduce((s, a) => s + a.credits, 0);

  return {
    ok: true,
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    route: `${flight.departureAirport} to ${flight.arrivalAirport}`,
    finalized: man.finalized,
    totalPassengers: summary.totalPassengers,
    eligibleCount: awarded.length,
    excludedCount: summary.excludedCount + skipped.length,
    capApplied: summary.capApplied,
    awarded,
    skipped,
    excluded: summary.excluded,
    totalPoints,
    totalCredits,
    branding: cfg.branding,
  };
}

/**
 * Apply rewards to all eligible passengers on a completed flight.
 * Idempotent per passenger and guarded at the manifest level.
 *
 * @param {object} flight
 * @param {string} staffId — authorising staff member
 * @param {object} opts
 * @returns {Promise<{applied:boolean, reason?:string, results:Array, totals:object}>}
 */
export async function awardFlightRewards(flight, staffId, { config = null, manifest = null, autoFinalize = false } = {}) {
  const cfg = config || (await getLoyaltyConfig());

  // Only completed flights can earn.
  const rewardedStatuses = cfg.eligibility?.rewardedFlightStatuses || ["completed"];
  if (!rewardedStatuses.includes(flight.status)) {
    return { applied: false, reason: "FLIGHT_NOT_COMPLETED", message: `Flight status is "${flight.status}". Only ${rewardedStatuses.join("/")} flights can award rewards.`, results: [] };
  }

  const man = manifest || (await getManifest(flight.id));
  if (!man) {
    return { applied: false, reason: "NO_MANIFEST", message: "No manifest exists for this flight.", results: [] };
  }

  if (autoFinalize && !man.finalized) {
    await finalizeManifest(flight.id, staffId);
  }
  if (!man.finalized && !autoFinalize) {
    return { applied: false, reason: "NOT_FINALIZED", message: "Manifest must be finalized (presence confirmed) before rewards are applied.", results: [] };
  }

  if (man.rewardsApplied) {
    return { applied: false, reason: "ALREADY_APPLIED", message: "Rewards already applied to this flight.", results: [] };
  }

  const preview = await buildRewardPreview(flight, { config: cfg, manifest: man });
  if (!preview.ok) {
    return { applied: false, reason: preview.error, message: preview.message, results: [] };
  }

  const db = getDb();
  const results = [];

  for (const entry of preview.awarded) {
    // Exactly-once key per (flight, user, currency).
    const ptsKey = `flight:${flight.id}:${entry.userId}:points`;
    const credKey = `flight:${flight.id}:${entry.userId}:credits`;

    const ptsResult = await applyLedgerEntry({
      userId: entry.userId,
      currency: CURRENCY.POINTS,
      amount: entry.points,
      type: TX_TYPE.FLIGHT_EARN,
      reason: `Flight ${flight.flightNumber}: ${flight.departureAirport} to ${flight.arrivalAirport}`,
      idempotencyKey: ptsKey,
      actorId: null, // system
      referenceType: "flight",
      referenceId: flight.id,
      metadata: {
        flightNumber: flight.flightNumber,
        route: `${flight.departureAirport} to ${flight.arrivalAirport}`,
        cabinClass: entry.cabinClass,
        explanation: entry.explanation,
        basis: entry.breakdown.basis,
      },
      lifetime: {
        pointsDelta: entry.points,
        qualifyingPointsDelta: entry.points,
        qualifyingFlightDelta: 1,
      },
    });

    const credResult = await applyLedgerEntry({
      userId: entry.userId,
      currency: CURRENCY.CREDITS,
      amount: entry.credits,
      type: TX_TYPE.FLIGHT_EARN,
      reason: `Flight ${flight.flightNumber}: ${flight.departureAirport} to ${flight.arrivalAirport}`,
      idempotencyKey: credKey,
      actorId: null,
      referenceType: "flight",
      referenceId: flight.id,
      metadata: {
        flightNumber: flight.flightNumber,
        route: `${flight.departureAirport} to ${flight.arrivalAirport}`,
        cabinClass: entry.cabinClass,
      },
    });

    results.push({
      userId: entry.userId,
      displayName: entry.displayName,
      points: entry.points,
      credits: entry.credits,
      pointsApplied: ptsResult.applied,
      creditsApplied: credResult.applied,
      pointsDuplicate: ptsResult.duplicate,
      creditsDuplicate: credResult.duplicate,
    });
  }

  // Guard the manifest so a re-run short-circuits.
  const flagged = await markRewardsApplied(flight.id);

  // Post-flight tier recompute (rewards may have pushed members over a threshold).
  for (const entry of preview.awarded) {
    try {
      const { syncTier } = await import("./tiers.js");
      await syncTier(entry.userId, cfg);
    } catch (e) {
      console.error("[flightRewards] Tier sync failed:", e.message);
    }
  }

  const totals = {
    totalPoints: preview.totalPoints,
    totalCredits: preview.totalCredits,
    rewardedPassengers: results.filter((r) => r.pointsApplied).length,
    skippedCount: preview.skipped.length,
  };

  return { applied: flagged, reason: flagged ? null : "ALREADY_APPLIED", results, totals, preview };
}

/**
 * Audited correction path. Writes compensating (negative) ledger entries to
 * reverse or adjust a previously applied reward. Never deletes history.
 *
 * @param {object} flight
 * @param {string} targetUserId
 * @param {string} staffId
 * @param {object} adjustment — { pointsDelta, creditsDelta, reason }
 */
export async function reconcileFlight(flight, targetUserId, staffId, { pointsDelta = 0, creditsDelta = 0, reason }) {
  if (!reason || String(reason).trim().length < 3) {
    throw new Error("A reason is required for reconciliation.");
  }
  const cfg = await getLoyaltyConfig();

  const results = [];
  if (pointsDelta !== 0) {
    const res = await applyLedgerEntry({
      userId: targetUserId,
      currency: CURRENCY.POINTS,
      amount: pointsDelta, // typically negative to reverse
      type: TX_TYPE.REVERSAL,
      reason: `Reconciliation for flight ${flight.flightNumber}: ${reason}`,
      idempotencyKey: `reconcile:${flight.id}:${targetUserId}:points:${Date.now()}`,
      actorId: staffId,
      referenceType: "flight",
      referenceId: flight.id,
      metadata: { correction: true },
      lifetime: {
        pointsDelta: pointsDelta,
        qualifyingPointsDelta: pointsDelta,
        qualifyingFlightDelta: pointsDelta < 0 ? -1 : 0,
      },
      allowOverdraw: false,
    });
    results.push({ currency: "points", ...res });
  }
  if (creditsDelta !== 0) {
    const res = await applyLedgerEntry({
      userId: targetUserId,
      currency: CURRENCY.CREDITS,
      amount: creditsDelta,
      type: TX_TYPE.REVERSAL,
      reason: `Reconciliation for flight ${flight.flightNumber}: ${reason}`,
      idempotencyKey: `reconcile:${flight.id}:${targetUserId}:credits:${Date.now()}`,
      actorId: staffId,
      referenceType: "flight",
      referenceId: flight.id,
      metadata: { correction: true },
      allowOverdraw: false,
    });
    results.push({ currency: "credits", ...res });
  }

  await writeAudit({
    actorId: staffId,
    action: "reconcileFlight",
    targetUserId,
    amount: pointsDelta || creditsDelta,
    currency: pointsDelta ? "points" : "credits",
    reason,
    referenceType: "flight",
    referenceId: flight.id,
    before: null,
    after: { pointsDelta, creditsDelta },
  });

  return { reconciled: true, results, branding: cfg.branding };
}

export default { buildRewardPreview, awardFlightRewards, reconcileFlight };