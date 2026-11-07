/**
 * tiers.test.js — Unit tests for status tier computation.
 * These are pure functions; no Firestore required.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeTier, tierProgress } from "../src/services/tierRules.js";
import { cloneDefaults } from "../src/config/loyaltyConfig.js";

const cfg = cloneDefaults();

test("Explorer is the default starting tier", () => {
  const tier = computeTier({ qualifyingPoints: 0, qualifyingFlightCount: 0 }, cfg);
  assert.equal(tier.key, "explorer");
});

test("Adventurer unlocks at 3000 lifetime qualifying points", () => {
  assert.equal(computeTier({ qualifyingPoints: 2999 }, cfg).key, "explorer");
  assert.equal(computeTier({ qualifyingPoints: 3000 }, cfg).key, "adventurer");
  assert.equal(computeTier({ qualifyingPoints: 9999 }, cfg).key, "adventurer");
});

test("Elite unlocks at 10000 lifetime qualifying points", () => {
  assert.equal(computeTier({ qualifyingPoints: 10000 }, cfg).key, "elite");
  assert.equal(computeTier({ qualifyingPoints: 500000 }, cfg).key, "elite");
});

test("tier uses lifetime qualifying metric, not spendable balance", () => {
  // A member who spent everything: qualifying points high, but if the metric
  // were the balance they would be demoted. Verify they are not.
  const metrics = { qualifyingPoints: 12000, qualifyingFlightCount: 20, balance: 0 };
  const tier = computeTier(metrics, cfg);
  assert.equal(tier.key, "elite", "spending must not demote");
});

test("flight-count metric alternative is honoured", () => {
  const countCfg = cloneDefaults();
  countCfg.qualifyingMetric = "qualifyingFlightCount";
  countCfg.tiers.list = [
    { key: "explorer", name: "Explorer", min: 0, roleEnvKey: "rewardsLevel1RoleId" },
    { key: "adventurer", name: "Adventurer", min: 10, roleEnvKey: "rewardsLevel2RoleId" },
    { key: "elite", name: "Elite", min: 30, roleEnvKey: "rewardsLevel3RoleId" },
  ];
  assert.equal(computeTier({ qualifyingPoints: 99999, qualifyingFlightCount: 3 }, countCfg).key, "explorer");
  assert.equal(computeTier({ qualifyingPoints: 0, qualifyingFlightCount: 30 }, countCfg).key, "elite");
});

test("progress reports percentage and remaining toward next tier", () => {
  const p = tierProgress({ qualifyingPoints: 1500, qualifyingFlightCount: 5 }, cfg);
  assert.equal(p.current.key, "explorer");
  assert.equal(p.next.key, "adventurer");
  assert.equal(p.remaining, 1500);
  assert.equal(p.percent, 50);
});

test("progress is 100% at max tier with no next tier", () => {
  const p = tierProgress({ qualifyingPoints: 20000, qualifyingFlightCount: 40 }, cfg);
  assert.equal(p.next, null);
  assert.equal(p.percent, 100);
});

test("tier names are configurable", () => {
  const custom = cloneDefaults();
  custom.tiers.list[1].name = "Senior Adventurer";
  const t = computeTier({ qualifyingPoints: 5000 }, custom);
  assert.equal(t.name, "Senior Adventurer");
});