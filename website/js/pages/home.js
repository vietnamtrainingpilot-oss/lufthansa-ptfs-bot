/**
 * pages/home.js — Home page.
 * Loads real published flights for the departures panel and hero stats, and
 * real earning rates for the loyalty summary. Never invents numbers.
 */

import { boot, setTitle, api, num, esc } from "../site.js";
import { renderRouteCard, summariseFlights } from "../flightCard.js";
import { wireBookingButtons } from "../booking.js";
import { emptyState, errorState } from "../site.js";

async function loadFlights() {
  const grid = document.getElementById("featured-flights");
  const stats = document.getElementById("ops-stats");

  try {
    const { flights } = await api("/api/flights/active");

    // Hero stats
    const s = summariseFlights(flights || []);
    stats.innerHTML = `
      <div class="ops-stat"><dt>Open departures</dt><dd>${num(s.count)}</dd></div>
      <div class="ops-stat"><dt>Distinct routes</dt><dd>${num(s.routes)}</dd></div>
      <div class="ops-stat"><dt>Aircraft types</dt><dd>${num(s.aircraft)}</dd></div>
      <div class="ops-stat"><dt>Scheduled hours</dt><dd>${num(s.totalHours)}</dd></div>`;

    const featured = (flights || []).slice(0, 3);
    if (!featured.length) {
      grid.className = "";
      grid.innerHTML = emptyState(
        "No flights are scheduled right now",
        "New departures are announced in the Discord server. Join the community to be notified when the next routes open.",
        '<a class="btn btn-primary btn-sm" href="/support.html">How to get notified</a>'
      );
      return;
    }

    grid.innerHTML = featured.map((f) => renderRouteCard(f)).join("");
    wireBookingButtons(grid);
  } catch (err) {
    grid.className = "";
    grid.innerHTML = errorState(err.message, 'data-retry="1"');
    stats.innerHTML = `<div class="ops-stat"><dt>Status</dt><dd style="font-size:var(--t-sm)">Unavailable</dd></div>`;
    grid.querySelector("[data-retry]")?.addEventListener("click", loadFlights);
  }
}

async function loadRates() {
  const pEl = document.getElementById("rate-points");
  const cEl = document.getElementById("rate-credits");
  try {
    const data = await api("/api/loyalty/public");
    const unitP = data.branding?.pointsUnit || "points";
    const unitC = data.branding?.creditsUnit || "credits";
    pEl.textContent = `${num(data.rates.pointsPer100km)} ${unitP} per 100 km`;
    cEl.textContent = `${num(data.rates.creditsPerHour)} ${unitC} per flight hour`;
  } catch {
    pEl.textContent = "See rewards page";
    cEl.textContent = "See rewards page";
  }
}

async function main() {
  await boot();
  setTitle("Virtual airline for Roblox Pilot To Server");
  await Promise.all([loadFlights(), loadRates()]);
}

main();