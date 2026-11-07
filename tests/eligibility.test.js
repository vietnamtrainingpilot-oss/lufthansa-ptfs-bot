/**
 * eligibility.test.js — Manifest eligibility and award-gating rules.
 * These are pure predicates, so they run without Firestore.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { isPassengerEligible, summariseEligible, PRESENCE, BOOKING_STATUS } from "../src/services/manifestRules.js";
import { cloneDefaults } from "../src/config/loyaltyConfig.js";

const cfg = cloneDefaults();

function p(over = {}) {
  return {
    userId: "1",
    bookingStatus: BOOKING_STATUS.CONFIRMED,
    presenceStatus: PRESENCE.PRESENT,
    eligible: true,
    isTest: false,
    cabinClass: "economy",
    ...over,
  };
}

test("confirmed + present + eligible passes", () => {
  assert.equal(isPassengerEligible(p()), true);
});

test("no-show earns nothing", () => {
  assert.equal(isPassengerEligible(p({ presenceStatus: PRESENCE.NO_SHOW })), false);
});

test("unmarked presence earns nothing", () => {
  assert.equal(isPassengerEligible(p({ presenceStatus: PRESENCE.UNMARKED })), false);
});

test("removed passenger earns nothing", () => {
  assert.equal(isPassengerEligible(p({ presenceStatus: PRESENCE.REMOVED })), false);
});

test("cancelled booking earns nothing", () => {
  assert.equal(isPassengerEligible(p({ bookingStatus: BOOKING_STATUS.CANCELLED })), false);
});

test("pending booking earns nothing", () => {
  assert.equal(isPassengerEligible(p({ bookingStatus: BOOKING_STATUS.PENDING })), false);
});

test("staff-marked ineligible earns nothing even if present", () => {
  assert.equal(isPassengerEligible(p({ eligible: false })), false);
});

test("test/demo bookings never earn", () => {
  assert.equal(isPassengerEligible(p({ isTest: true })), false);
});

test("summarise counts eligible vs excluded", () => {
  const manifest = {
    passengers: [
      p({ userId: "a" }),
      p({ userId: "b" }),
      p({ userId: "c", presenceStatus: PRESENCE.NO_SHOW }),
      p({ userId: "d", bookingStatus: BOOKING_STATUS.CANCELLED }),
      p({ userId: "e", isTest: true }),
    ],
  };
  const s = summariseEligible(manifest, cfg);
  assert.equal(s.totalPassengers, 5);
  assert.equal(s.eligibleCount, 2);
  assert.equal(s.excludedCount, 3);
  assert.equal(s.eligiblePassengers.length, 2);
});

test("ineligible cabin classes are excluded", () => {
  const restricted = cloneDefaults();
  restricted.eligibility.eligibleCabinClasses = ["economy"];
  const manifest = { passengers: [p({ userId: "a", cabinClass: "economy" }), p({ userId: "b", cabinClass: "business" })] };
  const s = summariseEligible(manifest, restricted);
  assert.equal(s.eligibleCount, 1);
  assert.equal(s.eligiblePassengers[0].userId, "a");
});

test("per-flight cap limits rewarded passengers and is reported", () => {
  const capped = cloneDefaults();
  capped.eligibility.maxRewardedPassengersPerFlight = 2;
  const manifest = {
    passengers: [p({ userId: "a" }), p({ userId: "b" }), p({ userId: "c" }), p({ userId: "d" })],
  };
  const s = summariseEligible(manifest, capped);
  assert.equal(s.eligibleCount, 2);
  assert.equal(s.capApplied, true);
  assert.equal(s.excludedCount, 2);
});

test("empty manifest yields zero eligible", () => {
  const s = summariseEligible({ passengers: [] }, cfg);
  assert.equal(s.eligibleCount, 0);
  assert.equal(s.totalPassengers, 0);
});

test("null manifest is handled safely", () => {
  const s = summariseEligible(null, cfg);
  assert.equal(s.eligibleCount, 0);
});