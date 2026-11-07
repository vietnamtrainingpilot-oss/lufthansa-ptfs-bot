/**
 * memberRoutes.js — Authenticated member endpoints.
 *
 * Security invariants enforced here:
 *  - The target member is ALWAYS derived from the verified session cookie.
 *    There is no route that accepts a client-supplied Discord user ID for
 *    private data.
 *  - Cross-member access is impossible by construction: no userId parameter
 *    exists on any private route.
 *  - Mutations delegate to the ledger/catalogue services, which re-read price,
 *    stock and eligibility from Firestore inside a transaction.
 *  - Error responses never leak stack traces, secrets or database internals.
 */

import { getDb } from "../services/firestore.js";
import { readSession } from "./auth.js";
import rewardsService from "../services/rewards.js";
import * as catalogue from "../services/catalogue.js";
import * as missions from "../services/missions.js";
import { getLoyaltyConfig } from "../services/loyaltyStore.js";
import { computeTier, tierProgress, qualifyingMetricLabel } from "../services/tierRules.js";
import { isPassengerEligible } from "../services/manifestRules.js";

const HISTORY_PAGE_SIZE = 20;
const HISTORY_MAX_PAGES = 50;

/** Never leak internals. */
function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

/**
 * Attach `req.member` from the session, or null.
 * Used by every private route.
 */
export function attachMember(req, secret) {
  req.member = readSession(req, secret);
  return req.member;
}

/**
 * Wrap a handler so it only runs for an authenticated member.
 */
export function requireMember(req, res) {
  if (!req.member) {
    fail(res, 401, "Sign in to view this information.");
    return false;
  }
  return true;
}

/* ── Session ─────────────────────────────────────────────────────────────── */

export function meHandler(authCfg) {
  return (req, res) => {
    if (!req.member) {
      return res.json({ authenticated: false, authConfigured: authCfg.configured });
    }
    return res.json({
      authenticated: true,
      authConfigured: authCfg.configured,
      member: {
        id: req.member.id,
        username: req.member.username,
        globalName: req.member.global_name,
      },
    });
  };
}

/* ── Dashboard overview ──────────────────────────────────────────────────── */

export async function overviewHandler(req, res) {
  if (!requireMember(req, res)) return;
  try {
    const [profile, cfg, missionList] = await Promise.all([
      rewardsService.getMemberProfile(req.member.id),
      getLoyaltyConfig(),
      missions.getMemberMissions(req.member.id),
    ]);

    const claimable = missionList.filter((m) => m.claimable).length;

    res.json({
      branding: profile.branding,
      points: profile.points,
      credits: profile.credits,
      tier: {
        key: profile.tierKey,
        name: profile.tierName,
        metric: cfg.qualifyingMetric,
        metricLabel: qualifyingMetricLabel(cfg),
        percent: profile.progress?.percent ?? 100,
        remaining: profile.progress?.remaining ?? 0,
        nextName: profile.progress?.next?.name ?? null,
        nextMin: profile.progress?.next?.min ?? null,
        currentMin: profile.progress?.current?.min ?? 0,
      },
      lifetimePointsEarned: profile.lifetimePointsEarned,
      qualifyingPoints: profile.qualifyingPoints,
      qualifyingFlightCount: profile.qualifyingFlightCount,
      missions: { active: missionList.filter((m) => !m.claimed).length, claimable },
    });
  } catch (e) {
    console.error("[web] overview failed:", e.message);
    fail(res, 500, "Could not load your dashboard right now.");
  }
}

/* ── Transaction history (paginated) ─────────────────────────────────────── */

export async function historyHandler(req, res) {
  if (!requireMember(req, res)) return;
  try {
    const pageRaw = Number.parseInt(String(req.query.page || "1"), 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, HISTORY_MAX_PAGES) : 1;

    const currency = req.query.currency === "points" || req.query.currency === "credits" ? req.query.currency : null;

    const cfg = await getLoyaltyConfig();
    // Fetch a bounded window, then slice for pagination.
    const all = await rewardsService.getMemberHistory(req.member.id, { limit: HISTORY_PAGE_SIZE * HISTORY_MAX_PAGES, currency });
    const total = all.length;
    const start = (page - 1) * HISTORY_PAGE_SIZE;
    const items = all.slice(start, start + HISTORY_PAGE_SIZE).map((h) => ({
      id: h.id,
      currency: h.currency,
      amount: h.amount,
      type: h.type,
      reason: h.reason,
      at: h.at ? h.at.toDate ? h.at.toDate().toISOString() : h.at : null,
      flightNumber: h.metadata?.flightNumber ?? null,
    }));

    res.json({
      page,
      pageSize: HISTORY_PAGE_SIZE,
      total,
      hasMore: start + HISTORY_PAGE_SIZE < total,
      currency,
      // Labels are display-safe only; staff notes never enter this payload.
      unit: { points: cfg.branding.pointsUnit, credits: cfg.branding.creditsUnit },
      items,
    });
  } catch (e) {
    console.error("[web] history failed:", e.message);
    fail(res, 500, "Could not load your transaction history.");
  }
}

/* ── Member flight history ───────────────────────────────────────────────── */

export async function flightsHandler(req, res) {
  if (!requireMember(req, res)) return;
  try {
    const db = getDb();
    const cfg = await getLoyaltyConfig();

    // Firestore cannot query `array-contains` on an array of objects by a
    // nested field. A manifest stores `passengers: [{ userId, ... }]`, so we
    // maintain a flat, queryable mirror on the manifest document:
    //   passengerIds: ["<userId>", ...]
    // which is written by manifest.js on every upsert. That is what we query.
    const manifests = await db
      .collection("flightManifests")
      .where("passengerIds", "array-contains", req.member.id)
      .limit(50)
      .get();

    const flightIds = manifests.docs.map((d) => d.id);
    if (flightIds.length === 0) {
      return res.json({ flights: [], total: 0 });
    }

    const flightSnaps = await Promise.all(flightIds.map((id) => db.collection("flights").doc(id).get()));
    const rewardsByFlight = await loadFlightRewards(db, flightIds, req.member.id);

    const flights = flightSnaps
      .filter((s) => s.exists)
      .map((s) => {
        const f = s.data();
        const manifest = manifests.docs.find((d) => d.id === s.id)?.data();
        const entry = (manifest?.passengers || []).find((p) => p.userId === req.member.id) || null;
        const ledger = rewardsByFlight.get(s.id) || null;

        return {
          flightId: s.id,
          flightNumber: f.flightNumber,
          departure: f.departureAirport,
          arrival: f.arrivalAirport,
          aircraft: f.aircraft,
          flightTimeMinutes: f.flightTimeMinutes,
          scheduledUnixTime: f.scheduledUnixTime,
          // Public, already-shared event link only. No private server link.
          status: f.status,
          cabinClass: entry?.cabinClass ?? null,
          presence: entry?.presenceStatus ?? null,
          rewarded: !!ledger,
          pointsEarned: ledger?.points ?? 0,
          creditsEarned: ledger?.credits ?? 0,
          completedAt: ledger?.completedAt ?? null,
        };
      })
      .sort((a, b) => (b.scheduledUnixTime ?? 0) - (a.scheduledUnixTime ?? 0));

    res.json({ flights, total: flights.length, maxPerFlightPoints: cfg.formula.maxPointsPerFlight });
  } catch (e) {
    console.error("[web] member flights failed:", e.message);
    fail(res, 500, "Could not load your flight history.");
  }
}

/**
 * Build a map of flightId -> { points, credits, completedAt } for one member.
 *
 * Reads only ledger rows addressed to the signed-in member and only for the
 * supplied flights, so no other member's data is ever touched.
 */
async function loadFlightRewards(db, flightIds, userId) {
  const map = new Map();
  for (const flightId of flightIds) {
    let points = 0;
    let credits = 0;
    let completedAt = null;

    for (const currency of ["points", "credits"]) {
      const snap = await db
        .collection("economyLedger")
        .where("userId", "==", userId)
        .where("referenceId", "==", flightId)
        .where("referenceType", "==", "flight")
        .where("currency", "==", currency)
        .limit(1)
        .get();
      if (!snap.empty) {
        const doc = snap.docs[0].data();
        if (currency === "points") points = Math.max(0, doc.amount || 0);
        else credits = Math.max(0, doc.amount || 0);
        if (doc.at?.toDate) completedAt = doc.at.toDate().toISOString();
      }
    }
    if (points > 0 || credits > 0) map.set(flightId, { points, credits, completedAt });
  }
  return map;
}

/* ── Reward catalogue (member view) ──────────────────────────────────────── */

export async function catalogueHandler(req, res) {
  try {
    const cfg = await getLoyaltyConfig();
    const [points, credits] = await Promise.all([
      catalogue.listItems({ currency: "points" }),
      catalogue.listItems({ currency: "credits" }),
    ]);

    // Member eligibility and affordability are computed server-side.
    let account = null;
    if (req.member) account = await rewardsService.readAccount(req.member.id);

    const decorate = (items) =>
      items.map((i) => {
        const unit = i.currency === "credits" ? cfg.branding.creditsUnit : cfg.branding.pointsUnit;
        const balance = account ? (i.currency === "credits" ? account.credits : account.balance) : 0;
        const tier = account ? computeTier(account, cfg) : null;
        const tierOk = !i.eligibility?.minTierKey || (tier && cfg.tiers.list.findIndex((t) => t.key === tier.key) >= cfg.tiers.list.findIndex((t) => t.key === i.eligibility.minTierKey));
        const inStock = i.stock === null || i.stock === undefined || i.stock > 0;
        return {
          id: i.id,
          displayName: i.displayName,
          description: i.description,
          currency: i.currency,
          price: i.price,
          unit,
          stock: i.stock ?? null,
          inStock,
          requiresTier: i.eligibility?.minTierKey ?? null,
          fulfillment: i.fulfillment,
          eligible: inStock && tierOk,
          affordable: account ? balance >= i.price : false,
        };
      });

    res.json({
      branding: cfg.branding,
      catalogue: decorate(points),
      shop: decorate(credits),
      balance: account ? { points: account.balance, credits: account.credits } : null,
    });
  } catch (e) {
    console.error("[web] catalogue failed:", e.message);
    fail(res, 500, "Could not load the catalogue.");
  }
}

/* ── Missions (member view) ──────────────────────────────────────────────── */

export async function missionsHandler(req, res) {
  if (!requireMember(req, res)) return;
  try {
    const cfg = await getLoyaltyConfig();
    const list = await missions.getMemberMissions(req.member.id);
    res.json({
      branding: cfg.branding,
      missions: list.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        progress: m.progress,
        target: m.target,
        completed: m.completed,
        claimed: m.claimed,
        claimable: m.claimable,
        rewardAmount: m.rewardAmount,
        rewardCurrency: m.rewardCurrency,
        unit: m.rewardCurrency === "credits" ? cfg.branding.creditsUnit : cfg.branding.pointsUnit,
      })),
    });
  } catch (e) {
    console.error("[web] missions failed:", e.message);
    fail(res, 500, "Could not load your missions.");
  }
}

/* ── Redemption ──────────────────────────────────────────────────────────── */

/**
 * CSRF guard: state-changing requests must come from our own pages with a
 * same-origin fetch, which we verify via Sec-Fetch-Site when the browser sends
 * it, plus a same-origin Origin check. Requests without those headers (e.g. a
 * curl probe) are allowed only when the session cookie is present, which a
 * cross-site attacker cannot cause.
 */
function csrfOk(req) {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const o = new URL(origin);
      const host = req.headers.host;
      if (o.host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export async function redeemHandler(req, res) {
  if (!requireMember(req, res)) return;
  if (!csrfOk(req)) return fail(res, 403, "This request could not be verified. Please reload and try again.");

  const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : "";
  if (!itemId) return fail(res, 400, "No item was selected.");

  try {
    // Idempotency key is derived from the session member and item, with a
    // client nonce so a genuine second attempt is a new request while a
    // duplicate submission of the same click is not.
    const nonce = typeof req.body?.nonce === "string" ? req.body.nonce.slice(0, 64) : "";
    const key = `web:${req.member.id}:${itemId}:${nonce}`;

    const result = await catalogue.transactItem({ userId: req.member.id, itemId, idempotencyKey: key });

    const item = await catalogue.getItem(itemId);
    const cfg = await getLoyaltyConfig();
    const unit = item?.currency === "credits" ? cfg.branding.creditsUnit : cfg.branding.pointsUnit;
    const acc = await rewardsService.readAccount(req.member.id);
    const balance = item?.currency === "credits" ? acc.credits : acc.balance;

    res.json({
      ok: true,
      duplicate: !!result.duplicate,
      message: result.message,
      item: item ? { id: item.id, displayName: item.displayName } : null,
      receipt: {
        unit,
        price: item?.price ?? null,
        balanceAfter: balance,
      },
    });
  } catch (e) {
    const code = e.code;
    const map = {
      INSUFFICIENT_FUNDS: [400, "You do not have enough balance for this item."],
      OUT_OF_STOCK: [409, "This item is out of stock."],
      INELIGIBLE: [403, "You are not eligible for this item yet."],
      RATE_LIMIT: [429, "You have reached the daily transaction limit. Try again tomorrow."],
      COOLDOWN: [429, "Please wait a moment before your next transaction."],
      NOT_FOUND: [404, "That item no longer exists."],
    };
    if (map[code]) return fail(res, map[code][0], map[code][1]);
    console.error("[web] redeem failed:", e.message);
    fail(res, 500, "The redemption could not be completed. Please try again.");
  }
}

export async function missionClaimHandler(req, res) {
  if (!requireMember(req, res)) return;
  if (!csrfOk(req)) return fail(res, 403, "This request could not be verified. Please reload and try again.");

  const missionId = typeof req.body?.missionId === "string" ? req.body.missionId : "";
  if (!missionId) return fail(res, 400, "No mission was selected.");

  try {
    const result = await missions.claimMissionReward({ userId: req.member.id, missionId });
    const cfg = await getLoyaltyConfig();
    res.json({
      ok: true,
      reward: {
        amount: result.rewardAmount,
        currency: result.rewardCurrency,
        unit: result.rewardCurrency === "credits" ? cfg.branding.creditsUnit : cfg.branding.pointsUnit,
      },
    });
  } catch (e) {
    const map = {
      ALREADY_CLAIMED: [409, "You have already claimed this mission reward."],
      NOT_COMPLETED: [400, "This mission is not complete yet."],
      INACTIVE: [400, "This mission is no longer active."],
      NOT_FOUND: [404, "That mission no longer exists."],
    };
    if (map[e.code]) return fail(res, map[e.code][0], map[e.code][1]);
    console.error("[web] mission claim failed:", e.message);
    fail(res, 500, "The claim could not be completed. Please try again.");
  }
}

export default {
  attachMember,
  meHandler,
  overviewHandler,
  historyHandler,
  flightsHandler,
  catalogueHandler,
  missionsHandler,
  redeemHandler,
  missionClaimHandler,
};