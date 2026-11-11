/**
 * mileageSystem.js — Lufthansa Miles & More Core System
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import {
  signUpClient,
  getOrCreateAccount,
  getMemberAccount,
  deleteAccount,
  TIERS,
} from "./members.js";
import {
  calculateFlightEarnings,
  calculateCrewEarnings,
  parseRouteKey,
  applyPromotion,
} from "./mileageEngine.js";
import { createTimer } from "../timers/timers.js";
import config from "../config/config.js";
import { buildText, buildMessage } from "../utils/builders.js";
import { flightLabel } from "../config/brand.js";

export async function createFlightAndClaim({
  flightNumber,
  departure,
  arrival,
  crew,
  crewMembers,
  distanceKm,
  routeKey,
  client,
  guild,
}) {
  if (!distanceKm || !routeKey) {
    const dist = parseRouteKey(routeKey);
    distanceKm = dist;
  }

  const db = getDb();
  const flightId = db.collection("flights").doc().id;

  const flightData = {
    id: flightId,
    flightNumber,
    departureAirport: departure,
    arrivalAirport: arrival,
    routeKey,
    status: "commitable",
    crewMembers: crewMembers || [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    scheduledUnixTime: Math.floor(Date.now() / 1000) + 3600,
  };

  await db.collection("flights").doc(flightId).set(flightData);

  const claims = [];
  for (const crewId of crewMembers) {
    const claimId = db.collection("claims").doc().id;

    const claimData = {
      id: claimId,
      flightId,
      member: { userId: crewId, name: `Crew ${crewId.split("-")[1] || "Member"}` },
      status: "open",
      cabin: "business",
      claimedAt: null,
      startDate: new Date(),
      statusPoints: 200,
    };

    await db.collection("claims").doc(claimId).set(claimData);
    claims.push(claimData.id);
  }

  return { flightId, claims };
}

export async function claimFlight({ claimCode, code, cabin, claimedAt, member, client }) {
  if (claimCode !== code) {
    throw new Error("Invalid claim code");
  }

  const db = getDb();
  const flightId = `file:${code}`;

  const doc = await db.collection("flights").doc(flightId).get();
  if (!doc.exists) {
    throw new Error("Flight not found");
  }

  return { status: "ok" };
}

export async function seedMileageSystem(logger) {
  const db = getDb();

  await db.collection("routes").doc("HAN-DAD").set({
    name: "HAN - Frankfurt",
    origin: "HAN",
    destination: "DAD",
    distanceKm: 800,
    createdAt: new Date(),
  });

  logger.info("Mileage & More system initialized");
  return true;
}

export async function initializeTiers(db) {
  const docRef = db.collection("config").doc("mileageTiers");
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    await docRef.set({
      frequent_traveler: { statusPoints: 650, label: "Frequent Traveller" },
      senator: { statusPoints: 2000, label: "Senator" },
      hon_circle: { statusPoints: 6000, label: "HON Circle" },
      lastUpdated: new Date().toISOString(),
    });
  }
}

export default {
  createFlightAndClaim,
  claimFlight,
  seedMileageSystem,
  initializeTiers,
};