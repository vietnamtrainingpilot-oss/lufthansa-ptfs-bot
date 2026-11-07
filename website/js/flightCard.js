/**
 * flightCard.js — Shared flight/route card rendering.
 * Used by both the home page and the flights page so they cannot drift.
 */

import { esc, num, formatDateTime, formatDuration, airportCode, airportName } from "./site.js";

/** Status badge for a flight. */
export function statusBadge(status) {
  const map = {
    scheduled: ["badge-neutral", "Scheduled"],
    checkin: ["badge-success", "Check-in open"],
    completed: ["badge-info", "Completed"],
    cancelled: ["badge-danger", "Cancelled"],
    delayed: ["badge-warning", "Delayed"],
  };
  const [cls, label] = map[status] || ["badge-neutral", status || "Unknown"];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

/**
 * Render a route card.
 * @param {object} flight
 * @param {object} opts
 * @param {boolean} opts.bookable — show the book button
 * @param {string} opts.bookLabel
 */
export function renderRouteCard(flight, { bookable = true, bookLabel = "Request seat" } = {}) {
  const dep = flight.departureAirport || "";
  const arr = flight.arrivalAirport || "";

  const classes = String(flight.classes || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  return `
    <article class="route-card">
      <div class="route-card-head">
        <div class="route-path">
          <div class="route-end">
            <span class="route-code">${esc(airportCode(dep))}</span>
            <span class="route-city">${esc(airportName(dep) || dep)}</span>
          </div>
          <span class="route-line" aria-hidden="true"></span>
          <span class="route-arrow" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </span>
          <div class="route-end">
            <span class="route-code">${esc(airportCode(arr))}</span>
            <span class="route-city">${esc(airportName(arr) || arr)}</span>
          </div>
        </div>
        <span class="flight-number">${esc(flight.flightNumber || "—")}</span>
      </div>

      <div class="route-card-body">
        <div class="meta-grid">
          <div>
            <p class="meta-label">Departs</p>
            <p class="meta-value">${esc(formatDateTime(flight.scheduledUnixTime ? flight.scheduledUnixTime * 1000 : null))}</p>
          </div>
          <div>
            <p class="meta-label">Flight time</p>
            <p class="meta-value">${esc(formatDuration(flight.flightTimeMinutes))}</p>
          </div>
          <div>
            <p class="meta-label">Aircraft</p>
            <p class="meta-value">${esc(flight.aircraft || "—")}</p>
          </div>
          <div>
            <p class="meta-label">Status</p>
            <p class="meta-value">${statusBadge(flight.status)}</p>
          </div>
        </div>
        ${
          classes.length
            ? `<div class="flex gap-2 wrap">
                 <span class="xs muted">Classes</span>
                 ${classes.map((c) => `<span class="badge badge-neutral">${esc(c)}</span>`).join("")}
               </div>`
            : ""
        }
      </div>

      ${
        bookable
          ? `<div class="route-card-foot">
               <button class="btn btn-primary btn-block"
                       data-book-flight="${esc(flight.flightNumber || "")}"
                       data-book-cabin="${esc(classes.join(", "))}"
                       ${flight.status === "scheduled" || flight.status === "checkin" ? "" : "disabled"}>
                 ${esc(bookLabel)}
               </button>
             </div>`
          : ""
      }
    </article>`;
}

/** Public flight count summary used by the hero panel. */
export function summariseFlights(flights) {
  const routes = new Set();
  let totalMinutes = 0;
  const aircraft = new Set();

  for (const f of flights) {
    routes.add(`${f.departureAirport}->${f.arrivalAirport}`);
    totalMinutes += Number(f.flightTimeMinutes) || 0;
    if (f.aircraft) aircraft.add(f.aircraft);
  }

  return {
    count: flights.length,
    routes: routes.size,
    aircraft: aircraft.size,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
  };
}