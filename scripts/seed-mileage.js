/**
 * seed-mileage.js — Seed initial Miles & More configuration
 */
import admin from "firebase-admin";
import { getDb } from "../src/services/firestore.js";

async function seed() {
  const db = getDb();
  
  // Default routes
  const routes = [
    { id: "HAN-DAD", name: "Hamburg - Dusseldorf", origin: "HAN", destination: "DAD", distanceKm: 400 },
    { id: "HAN-MUC", name: "Hamburg - Munich", origin: "HAN", destination: "MUC", distanceKm: 580 },
    { id: "HAN-FRA", name: "Hamburg - Frankfurt", origin: "HAN", destination: "FRA", distanceKm: 620 },
    { id: "MUC-FRA", name: "Munich - Frankfurt", origin: "MUC", destination: "FRA", distanceKm: 390 },
  ];
  
  for (const route of routes) {
    await db.collection("routes").doc(route.id).set(route);
  }
  
  // Milestone thresholds
  await db.collection("config").doc("milestoneThresholds").set({
    firstFlight: { flights: 1, miles: 1000 },
    veteranTraveler: { flights: 10, miles: 10000 },
    frequentFlyer: { flights: 50, miles: 50000 },
    miler: { miles: 1000 },
    century: { miles: 10000 },
  });
  
  console.log("[seed] Mileage & More system seeded");
}

seed().catch(console.error);
