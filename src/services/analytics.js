/**
 * analytics.js — System 20: Community Analytics & Reporting.
 *
 * Aggregates verified metrics: flight counts, passenger totals, rewards issued,
 * ticket volume, career application conversion, and economy health.
 */

import { getDb } from "./firestore.js";

export async function getCommunityAnalytics() {
  const db = getDb();

  const [flightsSnap, accountsSnap, ticketsSnap, careersSnap] = await Promise.all([
    db.collection("flights").get(),
    db.collection("rewardsAccounts").get(),
    db.collection("tickets").get(),
    db.collection("careerApplications").get(),
  ]);

  const flights = flightsSnap.docs.map((d) => d.data());
  const accounts = accountsSnap.docs.map((d) => d.data());
  const tickets = ticketsSnap.docs.map((d) => d.data());
  const careers = careersSnap.docs.map((d) => d.data());

  const totalFlights = flights.length;
  const completedFlights = flights.filter((f) => f.status === "completed").length;
  const scheduledFlights = flights.filter((f) => f.status === "scheduled" || f.status === "checkin").length;

  const totalMembers = accounts.length;
  const totalMilesEarned = accounts.reduce((acc, a) => acc + Number(a.lifetimePointsEarned || 0), 0);
  const totalCreditsInCirculation = accounts.reduce((acc, a) => acc + Number(a.credits || 0), 0);
  const totalQualifyingFlights = accounts.reduce((acc, a) => acc + Number(a.qualifyingFlightCount || 0), 0);

  const ticketsOpen = tickets.filter((t) => t.status === "open").length;
  const ticketsClosed = tickets.filter((t) => t.status === "closed").length;

  const careerSubmitted = careers.length;
  const careerAccepted = careers.filter((c) => c.status === "accepted").length;
  const careerDenied = careers.filter((c) => c.status === "denied").length;
  const careerAcceptanceRate = careerSubmitted > 0 ? Math.round((careerAccepted / careerSubmitted) * 100) : 0;

  return {
    timestamp: new Date().toISOString(),
    flights: {
      total: totalFlights,
      completed: completedFlights,
      scheduled: scheduledFlights,
      completionRate: totalFlights > 0 ? Math.round((completedFlights / totalFlights) * 100) : 0,
    },
    members: {
      total: totalMembers,
      totalQualifyingFlights,
      totalMilesEarned,
      totalCreditsInCirculation,
    },
    support: {
      open: ticketsOpen,
      closed: ticketsClosed,
      total: tickets.length,
    },
    careers: {
      submitted: careerSubmitted,
      accepted: careerAccepted,
      denied: careerDenied,
      acceptanceRatePercent: careerAcceptanceRate,
    },
  };
}

export default { getCommunityAnalytics };
