/**
 * flightNumber.test.js — Unit tests for the brand flight-number helpers.
 *
 * Guards entry-point validation added during the Lufthansa rebrand:
 * createflight, flightupdate, logflight and the booking API must accept the
 * brand prefix format and reject any legacy prefix.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { FLIGHT_PREFIX, isValidFlightNumber, normalizeFlightNumber, flightLabel } from "../src/config/brand.js";

test("the brand flight prefix is LH", () => {
  assert.equal(FLIGHT_PREFIX, "LH");
});

test("isValidFlightNumber accepts the brand format", () => {
  for (const ok of ["LH 101", "LH101", "LH 2048", " lh 101 "]) {
    assert.equal(isValidFlightNumber(ok), true, `${ok} must be accepted`);
  }
});

test("isValidFlightNumber rejects other formats and legacy prefixes", () => {
  for (const bad of ["VJ101", "VJ 101", "101", "NOPE", "LH12", "LH12345", "LH-101", "", null, undefined]) {
    assert.equal(isValidFlightNumber(bad), false, `${bad} must be rejected`);
  }
});

test("normalizeFlightNumber reduces any accepted input to the bare numeral", () => {
  assert.equal(normalizeFlightNumber("LH 101"), "101");
  assert.equal(normalizeFlightNumber("LH101"), "101");
  assert.equal(normalizeFlightNumber("101"), "101");
  assert.equal(normalizeFlightNumber(" VJ101 "), "101", "legacy VJ input still normalises so lookups never crash");
});

test("flightLabel renders the brand format with a space", () => {
  assert.equal(flightLabel("101"), "LH 101");
  assert.equal(flightLabel("LH101"), "LH 101");
});
