/**
 * pages/flights.js — Flights browse, filter and booking entry point.
 */

import { boot, setTitle, api, esc, num, airportCode } from "../site.js";
import { renderRouteCard } from "../flightCard.js";
import { wireBookingButtons } from "../booking.js";
import { emptyState, errorState, busy } from "../site.js";

let allFlights = [];

function populateFilters() {
  const departures = [...new Set(allFlights.map((f) => f.departureAirport).filter(Boolean))].sort();
  const arrivals = [...new Set(allFlights.map((f) => f.arrivalAirport).filter(Boolean))].sort();

  const dSel = document.getElementById("filter-departure");
  const aSel = document.getElementById("filter-arrival");

  for (const label of departures) {
    const o = document.createElement("option");
    o.value = label;
    o.textContent = `${airportCode(label)} — ${label}`;
    dSel.appendChild(o);
  }
  for (const label of arrivals) {
    const o = document.createElement("option");
    o.value = label;
    o.textContent = `${airportCode(label)} — ${label}`;
    aSel.appendChild(o);
  }
}

function applyFilters() {
  const grid = document.getElementById("flights-grid");
  const countEl = document.getElementById("results-count");
  const dep = document.getElementById("filter-departure").value;
  const arr = document.getElementById("filter-arrival").value;
  const status = document.getElementById("filter-status").value;

  const filtered = allFlights.filter((f) => {
    if (dep && f.departureAirport !== dep) return false;
    if (arr && f.arrivalAirport !== arr) return false;
    if (status && f.status !== status) return false;
    return true;
  });

  countEl.textContent =
    filtered.length === allFlights.length
      ? `${num(allFlights.length)} departure${allFlights.length === 1 ? "" : "s"}`
      : `${num(filtered.length)} of ${num(allFlights.length)} departures`;

  if (!filtered.length) {
    grid.className = "";
    grid.innerHTML = emptyState(
      "No departures match those filters",
      "Try clearing one of the filters, or check back later. New routes are announced in the Discord server.",
      '<button class="btn btn-secondary btn-sm" id="clear-filters">Clear filters</button>'
    );
    document.getElementById("clear-filters")?.addEventListener("click", () => {
      document.getElementById("filter-departure").value = "";
      document.getElementById("filter-arrival").value = "";
      document.getElementById("filter-status").value = "";
      applyFilters();
    });
    return;
  }

  grid.className = "grid grid-3";
  grid.innerHTML = filtered.map((f) => renderRouteCard(f)).join("");
  wireBookingButtons(grid);
}

async function load() {
  const grid = document.getElementById("flights-grid");
  const countEl = document.getElementById("results-count");
  try {
    const { flights } = await api("/api/flights/active");
    allFlights = Array.isArray(flights) ? flights : [];

    if (!allFlights.length) {
      grid.className = "";
      grid.innerHTML = emptyState(
        "No flights are published right now",
        "The schedule is currently empty. Join the Discord server to be notified when the next departures open.",
        '<a class="btn btn-primary btn-sm" href="/">Back to home</a>'
      );
      countEl.textContent = "No departures";
      return;
    }

    populateFilters();
    applyFilters();
  } catch (err) {
    grid.className = "";
    grid.innerHTML = errorState(err.message, 'data-retry="1"');
    countEl.textContent = "Unavailable";
    grid.querySelector("[data-retry]")?.addEventListener("click", load);
  }
}

async function main() {
  await boot();
  setTitle("Flights");

  for (const id of ["filter-departure", "filter-arrival", "filter-status"]) {
    document.getElementById(id).addEventListener("change", applyFilters);
  }

  const refresh = document.getElementById("refresh-btn");
  refresh.addEventListener("click", async () => {
    const restore = busy(refresh, "Refreshing");
    await load();
    restore();
  });

  await load();
}

main();