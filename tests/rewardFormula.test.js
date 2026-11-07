/**
 * rewardFormula.test.js — Unit tests for the pure reward calculation engine.
 * Run: node --test tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { calculateFlightReward, resolveBasis, normaliseCabinClass } from "../src/services/rewardFormula.js";
import { cloneDefaults, validateConfigPatch } from "../src/config/loyaltyConfig.js";

const cfg = cloneDefaults();
const TIER = "explorer";

function flight(overrides = {}) {
  return {
    routeDistanceKm: 1000,
    flightTimeMinutes: 120,
    ...overrides,
  };
}

test("cabin class normalisation handles free text", () => {
  assert.equal(normaliseCabinClass("Economy"), "economy");
  assert.equal(normaliseCabinClass("Premium Economy"), "premium");
  assert.equal(normaliseCabinClass("premium_economy"), "premium");
  assert.equal(normaliseCabinClass("BUSINESS_CLASS"), "business");
  assert.equal(normaliseCabinClass("biz"), "business");
  assert.equal(normaliseCabinClass(undefined), "economy");
  assert.equal(normaliseCabinClass("garbage"), "economy");
});

test("distance basis: 1000 km economy = 100 points, 20 credits", () => {
  const r = calculateFlightReward({ flight: flight(), cabinClass: "economy", tierKey: TIER, config: cfg });
  // 1000km * 10/100 = 100 base; economy x1.0 = 100
  assert.equal(r.points, 100);
  // 120 min = 2h * 20/h = 40 credits
  assert.equal(r.credits, 40);
  assert.equal(r.breakdown.basis, "distance");
});

test("premium economy multiplier applies to points only", () => {
  const r = calculateFlightReward({ flight: flight(), cabinClass: "premium", tierKey: TIER, config: cfg });
  assert.equal(r.points, 125); // 100 * 1.25
  assert.equal(r.credits, 46); // round(2 * 20 * 1.15) = 46
  assert.equal(r.breakdown.pointsMultiplier, 1.25);
});

test("business multiplier applies to points and credits separately", () => {
  const r = calculateFlightReward({ flight: flight(), cabinClass: "business", tierKey: TIER, config: cfg });
  assert.equal(r.points, 150); // 100 * 1.5
  assert.equal(r.credits, 54); // round(2*20*1.35) = 54
});

test("minimum points floor applies to very short flights", () => {
  const r = calculateFlightReward({
    flight: flight({ routeDistanceKm: 10, flightTimeMinutes: 10 }),
    cabinClass: "economy",
    tierKey: TIER,
    config: cfg,
  });
  assert.equal(r.points, 25, "should floor at minPointsPerFlight");
});

test("maximum points cap applies to very long flights", () => {
  const r = calculateFlightReward({
    flight: flight({ routeDistanceKm: 50000, flightTimeMinutes: 600 }),
    cabinClass: "economy",
    tierKey: TIER,
    config: cfg,
  });
  assert.equal(r.points, cfg.formula.maxPointsPerFlight, "should cap at maxPointsPerFlight");
});

test("hard cap cannot be exceeded even by a huge configured cap", () => {
  const badCfg = cloneDefaults();
  badCfg.formula.maxPointsPerFlight = 999999;
  const r = calculateFlightReward({
    flight: flight({ routeDistanceKm: 5000000, flightTimeMinutes: 600 }),
    cabinClass: "economy",
    tierKey: TIER,
    config: badCfg,
  });
  assert.ok(r.points <= badCfg.formula.hardCapPointsPerFlight, "must respect hard cap");
});

test("missing distance falls back to duration basis", () => {
  const r = calculateFlightReward({
    flight: flight({ routeDistanceKm: null }),
    cabinClass: "economy",
    tierKey: TIER,
    config: cfg,
  });
  assert.equal(r.breakdown.basis, "duration");
  // 120 min * 1.5 = 180 base
  assert.equal(r.points, 180);
  assert.ok(typeof r.explanation.summary === "string" && r.explanation.summary.includes("flight time"));
});

test("missing BOTH distance and duration throws MISSING_FLIGHT_BASIS", () => {
  assert.throws(
    () =>
      calculateFlightReward({
        flight: flight({ routeDistanceKm: null, flightTimeMinutes: null }),
        cabinClass: "economy",
        tierKey: TIER,
        config: cfg,
      }),
    (e) => e.code === "MISSING_FLIGHT_BASIS"
  );
});

test("tier bonus is applied and capped", () => {
  const elite = calculateFlightReward({ flight: flight(), cabinClass: "economy", tierKey: "elite", config: cfg });
  const explorer = calculateFlightReward({ flight: flight(), cabinClass: "economy", tierKey: "explorer", config: cfg });
  assert.equal(elite.points, explorer.points + cfg.formula.tierBonus.elite);
  assert.ok(elite.breakdown.tierBonus <= cfg.formula.maxTierBonusPerFlight);
});

test("excessive configured tier bonus is rejected by validation", () => {
  const { ok, errors } = validateConfigPatch(
    { formula: { tierBonus: { elite: 100000 } } },
    cloneDefaults()
  );
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes("maxTierBonusPerFlight")));
});

test("credits min and max are enforced", () => {
  const short = calculateFlightReward({
    flight: flight({ routeDistanceKm: 500, flightTimeMinutes: 5 }),
    cabinClass: "economy",
    tierKey: TIER,
    config: cfg,
  });
  assert.equal(short.credits, cfg.creditsFormula.minCreditsPerFlight);

  const long = calculateFlightReward({
    flight: flight({ routeDistanceKm: 100, flightTimeMinutes: 100000 }),
    cabinClass: "economy",
    tierKey: TIER,
    config: cfg,
  });
  assert.equal(long.credits, cfg.creditsFormula.maxCreditsPerFlight);
});

test("negative and zero rates are rejected by config validation", () => {
  assert.equal(validateConfigPatch({ formula: { pointsPer100km: -5 } }, cloneDefaults()).ok, false);
  assert.equal(validateConfigPatch({ creditsFormula: { creditsPerHour: -1 } }, cloneDefaults()).ok, false);
  assert.equal(validateConfigPatch({ formula: { minPointsPerFlight: 0 } }, cloneDefaults()).ok, false);
  assert.equal(validateConfigPatch({ formula: { minPointsPerFlight: 1.5 } }, cloneDefaults()).ok, false);
});

test("min greater than max is rejected", () => {
  const { ok, errors } = validateConfigPatch(
    { formula: { minPointsPerFlight: 500, maxPointsPerFlight: 100 } },
    cloneDefaults()
  );
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes("cannot exceed")));
});

test("tier list must start at 0 and be strictly increasing", () => {
  const { ok } = validateConfigPatch(
    { tiers: { list: [{ key: "a", name: "A", min: 100 }, { key: "b", name: "B", min: 200 }] } },
    cloneDefaults()
  );
  assert.equal(ok, false);

  const { ok: ok2 } = validateConfigPatch(
    { tiers: { list: [{ key: "a", name: "A", min: 0 }, { key: "b", name: "B", min: 100 }] } },
    cloneDefaults()
  );
  assert.equal(ok2, true);
});

test("resolveBasis prefers distance over duration", () => {
  const b = resolveBasis({ routeDistanceKm: 500, flightTimeMinutes: 60 }, cfg);
  assert.equal(b.basis, "distance");
  assert.equal(b.km, 500);
});

test("explanation contains no emoji", () => {
  const r = calculateFlightReward({ flight: flight(), cabinClass: "business", tierKey: "elite", config: cfg });
  const allText = JSON.stringify(r.explanation);
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(allText), "explanation must be emoji-free");
});