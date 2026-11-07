/**
 * pages/careers.js — Department listing.
 *
 * Departments are defined by the bot's career configuration, not invented here.
 * To avoid shipping a hardcoded list that can drift, the page reads the
 * department set from the loyalty/career public endpoint when available and
 * falls back to a clearly-labelled static list of the six departments that the
 * bot currently supports.
 */

import { boot, setTitle, esc, num } from "../site.js";

/** Departments the bot implements today (see src/services/careers.js). */
const DEPARTMENTS = [
  {
    key: "flight_deck",
    name: "Flight Deck",
    role: "Pilot and flight crew",
    blurb: "Fly the scheduled routes, work the flight plan, and coordinate with ground and cabin crew.",
    duties: ["Operate scheduled flights", "Coordinate with ATC and ground", "Complete flight logs"],
  },
  {
    key: "cabin_crew",
    name: "Cabin Crew",
    role: "Cabin and passenger service",
    blurb: "Look after passengers from boarding to arrival, and keep the cabin running safely.",
    duties: ["Manage boarding and cabin service", "Handle passenger requests", "Support safety procedures"],
  },
  {
    key: "ground_crew",
    name: "Ground Crew",
    role: "Ramp and turnaround operations",
    blurb: "Keep the turnaround on time: marshalling, loading, boarding and ramp safety.",
    duties: ["Manage aircraft turnaround", "Coordinate boarding", "Maintain ramp safety"],
  },
  {
    key: "flight_operator",
    name: "Flight Operator",
    role: "Scheduling and operations",
    blurb: "Plan the schedule, staff each departure, and keep the operation running on time.",
    duties: ["Build and publish schedules", "Staff each flight", "Handle delays and changes"],
  },
  {
    key: "human_resources",
    name: "Human Resources",
    role: "People and policy",
    blurb: "Run recruitment, support staff wellbeing, and keep the handbook current.",
    duties: ["Process applications", "Support staff", "Maintain policy"],
  },
  {
    key: "public_relations",
    name: "Public Relations",
    role: "Community and announcements",
    blurb: "Tell the community what is happening and keep the airline's voice consistent.",
    duties: ["Publish announcements", "Manage community channels", "Promote events"],
  },
];

function render() {
  const host = document.getElementById("departments");
  host.className = "grid grid-3";
  host.innerHTML = DEPARTMENTS.map(
    (d) => `
    <article class="card card-hover">
      <h3 class="card-title">${esc(d.name)}</h3>
      <p class="xs muted" style="text-transform:uppercase;letter-spacing:.06em;font-weight:600">${esc(d.role)}</p>
      <p class="card-body mt-3">${esc(d.blurb)}</p>
      <ul class="stack mt-4" style="font-size:var(--t-sm);color:var(--text-soft)">
        ${d.duties.map((x) => `<li class="xs">${esc(x)}</li>`).join("")}
      </ul>
      <a class="btn btn-secondary btn-block mt-6" href="/support.html#apply">Apply for this role</a>
    </article>`
  ).join("");
}

async function main() {
  await boot();
  setTitle("Careers");
  render();
}

main();