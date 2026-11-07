/**
 * pages/rewards.js — Public rewards explanation, tiers and catalogues.
 */

import { boot, setTitle, api, num, esc, currentSession, emptyState, errorState } from "../site.js";

function renderTiers(tiers, metricLabel) {
  const grid = document.getElementById("tier-grid");
  if (!Array.isArray(tiers) || !tiers.length) {
    grid.className = "";
    grid.innerHTML = emptyState("Tiers are being configured", "Status tiers have not been published yet.");
    return;
  }
  grid.className = "tier-grid grid";
  grid.innerHTML = tiers
    .map(
      (t) => `
      <article class="stat">
        <p class="stat-label">Tier</p>
        <p class="card-title mt-2" style="font-size:var(--t-xl)">${esc(t.name)}</p>
        <p class="stat-sub mono">${
          t.min === 0 ? "Automatic on joining" : `${num(t.min)} ${esc(metricLabel)}`
        }</p>
      </article>`
    )
    .join("");
}

function renderItems(gridId, items, unit) {
  const grid = document.getElementById(gridId);
  if (!Array.isArray(items) || !items.length) {
    grid.className = "";
    grid.innerHTML = emptyState("Nothing available yet", "This catalogue has not been stocked yet. Check back soon.");
    return;
  }
  grid.className = "grid grid-3";
  grid.innerHTML = items
    .map((i) => {
      const soldOut = i.stock !== null && i.stock !== undefined && i.stock <= 0;
      return `
      <article class="card">
        <div class="between" style="align-items:flex-start;gap:var(--s3)">
          <h3 class="card-title" style="margin:0">${esc(i.displayName)}</h3>
          <span class="mono" style="font-weight:600;color:var(--brand-red);white-space:nowrap">${num(i.price)} ${esc(unit)}</span>
        </div>
        <p class="card-body mt-2">${esc(i.description || "No description provided.")}</p>
        <div class="flex gap-2 wrap mt-4">
          ${soldOut ? '<span class="badge badge-danger">Out of stock</span>' : '<span class="badge badge-success">Available</span>'}
          ${i.requiresTier ? `<span class="badge badge-info">Requires ${esc(i.requiresTier)} status</span>` : ""}
        </div>
      </article>`;
    })
    .join("");
}

function renderSignInCta() {
  const host = document.getElementById("signin-cta");
  const s = currentSession();
  if (s.authenticated) {
    host.innerHTML = `
      <p class="card-body">You are signed in as <strong>${esc(s.member.globalName || s.member.username)}</strong>.</p>
      <a class="btn btn-primary btn-block mt-3" href="/dashboard.html">Open my dashboard</a>`;
  } else if (!s.authConfigured) {
    host.innerHTML = `<div class="alert alert-warning">${esc("Member sign-in is not configured on this server yet.")}</div>`;
  } else {
    host.innerHTML = `<a class="btn btn-primary btn-block" href="/auth/login">Sign in with Discord</a>
      <p class="hint mt-2">Sign in uses Discord OAuth. We request only the minimum permission needed to identify your account.</p>`;
  }
}

async function load() {
  const tierGrid = document.getElementById("tier-grid");
  const catGrid = document.getElementById("catalogue-grid");
  const shopGrid = document.getElementById("shop-grid");

  try {
    const data = await api("/api/loyalty/public");

    document.getElementById("points-label").textContent = data.branding?.pointsLabel || "Loyalty points";
    document.getElementById("credits-label").textContent = data.branding?.creditsLabel || "VJ Credits";

    const unitP = data.branding?.pointsUnit || "points";
    const unitC = data.branding?.creditsUnit || "credits";

    document.getElementById("points-earning").textContent =
      `Base rate ${num(data.rates.pointsPer100km)} ${unitP} per 100 km of route distance. ` +
      `Each eligible flight awards between ${num(data.rates.minPointsPerFlight)} and ${num(data.rates.maxPointsPerFlight)} ${unitP}. ` +
      `Cabin class and status tier can adjust the final amount.`;

    document.getElementById("credits-earning").textContent =
      `Base rate ${num(data.rates.creditsPerHour)} ${unitC} per eligible flight hour. ` +
      `Each eligible flight awards between ${num(data.rates.minCreditsPerFlight)} and ${num(data.rates.maxCreditsPerFlight)} ${unitC}.`;

    document.getElementById("tier-note").textContent =
      `Status is based on ${data.qualifyingMetricLabel || "lifetime qualifying points"} from verified flights. ` +
      `Spending points never reduces your status.`;

    renderTiers(data.tiers, data.qualifyingMetricLabel || "qualifying points");
    renderItems("catalogue-grid", data.catalogue, unitP);
    renderItems("shop-grid", data.shop, unitC);
  } catch (err) {
    tierGrid.className = "";
    catGrid.className = "";
    shopGrid.className = "";
    const msg = errorState(err.message, 'data-retry="1"');
    tierGrid.innerHTML = msg;
    catGrid.innerHTML = msg;
    shopGrid.innerHTML = msg;
    [tierGrid, catGrid, shopGrid].forEach((g) =>
      g.querySelector("[data-retry]")?.addEventListener("click", load)
    );
    document.getElementById("points-earning").textContent = "Earning rates are temporarily unavailable.";
    document.getElementById("credits-earning").textContent = "Earning rates are temporarily unavailable.";
  }
}

async function main() {
  await boot();
  setTitle("Rewards");
  renderSignInCta();
  await load();
}

main();