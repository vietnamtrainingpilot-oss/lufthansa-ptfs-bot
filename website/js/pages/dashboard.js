/**
 * pages/dashboard.js — Member dashboard.
 *
 * All values come from same-origin endpoints that derive identity from the
 * session cookie. Nothing is ever read from a URL parameter or client storage.
 */

import {
  boot, setTitle, api, num, esc, formatDate, formatDateTime, formatDuration,
  currentSession, emptyState, errorState, toast, busy, handleSignOut, ICONS,
  resetSession,
} from "../site.js";

const state = {
  overview: null,
  history: { page: 1, currency: "", hasMore: false, items: [] },
  flights: [],
  catalogue: null,
  catalogueTab: "points",
  missions: [],
  pendingRedeem: null,
};

/* ── Auth gate ───────────────────────────────────────────────────────────── */

function renderSignedOut() {
  const s = currentSession();
  document.getElementById("signed-out").hidden = false;
  document.getElementById("signed-in").hidden = true;

  const actions = document.getElementById("signed-out-actions");
  if (!s.authConfigured) {
    actions.innerHTML = `<div class="alert alert-warning" style="text-align:left">${esc(
      "Member sign-in is not configured on this server. An administrator needs to set the OAuth environment variables and restart the bot."
    )}</div>`;
  } else {
    actions.innerHTML = `<a class="btn btn-primary" href="/auth/login">Sign in with Discord</a>`;
  }
}

/**
 * A session can expire while the page is open (the cookie lasts 12 hours), so
 * a later request can start failing with 401 after the page already rendered as
 * signed in. Without this, every loader would show a generic error panel and
 * leave the member staring at a broken dashboard until they reloaded.
 *
 * Recognises a 401 from any member endpoint and switches the whole view back to
 * the signed-out state, which offers a fresh sign-in.
 *
 * @returns {boolean} true when the error was a session expiry and was handled
 */
function handleAuthError(err) {
  const status = err && (err.status ?? err.statusCode);
  if (status !== 401) return false;

  // Tell the shared session cache the member is no longer signed in, so the
  // header account area updates too.
  resetSession();
  renderSignedOut();
  return true;
}

/* ── Overview ────────────────────────────────────────────────────────────── */

/** Clamp a percentage into a safe 0-100 range for display. */
function pctLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0%";
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}

function renderOverview(o) {
  state.overview = o;
  const s = currentSession();

  document.getElementById("dash-greeting").textContent =
    `Welcome back, ${s.member.globalName || s.member.username}`;

  document.getElementById("stat-points-label").textContent = o.branding?.pointsLabel || "Loyalty points";
  document.getElementById("stat-credits-label").textContent = o.branding?.creditsLabel || "VJ Credits";
  document.getElementById("stat-points").textContent = num(o.points);
  document.getElementById("stat-credits").textContent = num(o.credits);
  document.getElementById("stat-tier").textContent = o.tier.name;
  document.getElementById("stat-tier-sub").textContent = o.tier.nextName
    ? `${pctLabel(o.tier.percent)} toward ${o.tier.nextName}`
    : "Highest tier reached";
  document.getElementById("stat-flights").textContent = num(o.qualifyingFlightCount);
  document.getElementById("stat-flights-sub").textContent = `${num(o.qualifyingPoints)} qualifying points`;
  document.getElementById("stat-points-sub").textContent = `${num(o.lifetimePointsEarned)} lifetime points earned`;

  // Tier progress
  const pct = Math.max(0, Math.min(100, Number(o.tier.percent ?? 0)));
  document.getElementById("tier-progress-name").textContent = o.tier.nextName
    ? `${o.tier.name} to ${o.tier.nextName}`
    : `${o.tier.name} — highest tier reached`;
  document.getElementById("tier-progress-pct").textContent = pctLabel(pct);
  document.getElementById("tier-bar-fill").style.width = `${pct}%`;
  document.getElementById("tier-bar").setAttribute("aria-valuenow", String(pct));
  document.getElementById("tier-foot-left").textContent = o.tier.nextName
    ? `Next tier at ${num(o.tier.nextMin)} ${o.tier.metricLabel}`
    : "You have reached the highest status tier.";
  document.getElementById("tier-foot-right").textContent = o.tier.nextName
    ? `${num(o.tier.remaining)} to go`
    : "";

  // Profile tab
  document.getElementById("profile-name").textContent = s.member.globalName || s.member.username;
  document.getElementById("profile-id").textContent = s.member.id;
  document.getElementById("profile-avatar").textContent =
    (s.member.globalName || s.member.username || "?").charAt(0).toUpperCase();
  document.getElementById("profile-lifetime").textContent = num(o.lifetimePointsEarned);
  document.getElementById("profile-qualifying").textContent = num(o.qualifyingPoints);
  document.getElementById("profile-flights").textContent = num(o.qualifyingFlightCount);
}

async function loadOverview() {
  const data = await api("/api/member/overview");
  renderOverview(data);
}

/* ── History ─────────────────────────────────────────────────────────────── */

const TYPE_LABEL = {
  flightEarn: "Flight reward",
  missionEarn: "Mission reward",
  staffAward: "Staff award",
  staffDeduct: "Staff deduction",
  redemption: "Redemption",
  purchase: "Purchase",
  refund: "Refund",
  reversal: "Correction",
  adjustment: "Adjustment",
};

function renderHistory() {
  const tbody = document.getElementById("hist-body");
  const { items, page, hasMore } = state.history;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="4">${emptyState(
      "No transactions yet",
      "Once you complete a verified flight, your points and credits will appear here."
    )}</td></tr>`;
  } else {
    tbody.innerHTML = items
      .map((h) => {
        const positive = h.amount >= 0;
        const unit = h.currency === "credits" ? (state.overview?.branding?.creditsUnit || "credits") : (state.overview?.branding?.pointsUnit || "points");
        const label = TYPE_LABEL[h.type] || h.type;
        return `
        <tr>
          <td data-label="Date">${esc(formatDate(h.at))}</td>
          <td data-label="Type"><span class="badge ${positive ? "badge-success" : "badge-neutral"}">${esc(label)}</span></td>
          <td data-label="Details" class="soft">${esc(h.reason || "—")}</td>
          <td data-label="Amount" style="text-align:right">
            <span class="num ${positive ? "pos" : "neg"}">${positive ? "+" : ""}${num(h.amount)} ${esc(unit)}</span>
          </td>
        </tr>`;
      })
      .join("");
  }

  document.getElementById("hist-page").textContent = `Page ${page}`;
  document.getElementById("hist-prev").disabled = page <= 1;
  document.getElementById("hist-next").disabled = !hasMore;
}

async function loadHistory(page = 1) {
  const tbody = document.getElementById("hist-body");
  tbody.innerHTML = `<tr><td colspan="4"><div class="skeleton skeleton-line" style="width:80%"></div></td></tr>`;
  try {
    const qs = new URLSearchParams({ page: String(page) });
    if (state.history.currency) qs.set("currency", state.history.currency);
    const data = await api(`/api/member/history?${qs}`);
    state.history = {
      page: data.page,
      currency: data.currency || "",
      hasMore: !!data.hasMore,
      items: data.items || [],
    };
    renderHistory();
  } catch (err) {
    if (handleAuthError(err)) return;
    tbody.innerHTML = `<tr><td colspan="4">${errorState(err.message)}</td></tr>`;
  }
}

/* ── Flights ─────────────────────────────────────────────────────────────── */

function presenceBadge(p) {
  const map = {
    present: ["badge-success", "Present"],
    no_show: ["badge-danger", "No-show"],
    removed: ["badge-danger", "Removed"],
    unmarked: ["badge-warning", "Not confirmed"],
  };
  const [cls, label] = map[p] || ["badge-neutral", p || "—"];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

function renderFlights() {
  const tbody = document.getElementById("flights-body");
  if (!state.flights.length) {
    tbody.innerHTML = `<tr><td colspan="6">${emptyState(
      "No flights recorded yet",
      "When you request a seat or complete a flight, it will appear here with your cabin and any rewards earned."
    )}</td></tr>`;
    return;
  }

  const unitP = state.overview?.branding?.pointsUnit || "points";
  const unitC = state.overview?.branding?.creditsUnit || "credits";

  tbody.innerHTML = state.flights
    .map((f) => `
      <tr>
        <td data-label="Date">${esc(formatDate(f.scheduledUnixTime ? f.scheduledUnixTime * 1000 : null))}</td>
        <td data-label="Flight"><span class="mono">${esc(f.flightNumber)}</span></td>
        <td data-label="Route" class="soft">${esc(f.departure)} to ${esc(f.arrival)}</td>
        <td data-label="Cabin">${esc(f.cabinClass || "—")}</td>
        <td data-label="Attendance">${presenceBadge(f.presence)}</td>
        <td data-label="Rewards" style="text-align:right">
          ${
            f.rewarded
              ? `<span class="num pos">+${num(f.pointsEarned)} ${esc(unitP)}</span><br><span class="num pos xs">+${num(f.creditsEarned)} ${esc(unitC)}</span>`
              : `<span class="muted xs">Not awarded</span>`
          }
        </td>
      </tr>`)
    .join("");
}

async function loadFlights() {
  const tbody = document.getElementById("flights-body");
  tbody.innerHTML = `<tr><td colspan="6"><div class="skeleton skeleton-line" style="width:70%"></div></td></tr>`;
  try {
    const data = await api("/api/member/flights");
    state.flights = data.flights || [];
    renderFlights();
  } catch (err) {
    if (handleAuthError(err)) return;
    tbody.innerHTML = `<tr><td colspan="6">${errorState(err.message)}</td></tr>`;
  }
}

/* ── Missions ────────────────────────────────────────────────────────────── */

function renderMissions() {
  const host = document.getElementById("missions-list");
  if (!state.missions.length) {
    host.innerHTML = emptyState(
      "No missions available",
      "There are no active missions right now. New challenges are posted regularly in the Discord server."
    );
    return;
  }

  host.innerHTML = state.missions
    .map((m) => {
      const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
      let action = "";
      if (m.claimed) action = `<span class="badge badge-success">Claimed</span>`;
      else if (m.claimable)
        action = `<button class="btn btn-primary btn-sm" data-claim-mission="${esc(m.id)}">Claim reward</button>`;
      else action = `<span class="muted xs">${m.progress} of ${m.target}</span>`;

      return `
      <article class="mission">
        <div class="mission-head">
          <div>
            <p class="mission-title">${esc(m.title)}</p>
          </div>
          <span class="badge badge-brand">+${num(m.rewardAmount)} ${esc(m.unit)}</span>
        </div>
        ${m.description ? `<p class="mission-desc">${esc(m.description)}</p>` : ""}
        <div class="bar" role="progressbar" aria-label="${esc(m.title)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
          <div class="bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="mission-foot">
          <span class="xs muted">${m.progress} of ${m.target} complete</span>
          ${action}
        </div>
      </article>`;
    })
    .join("");

  host.querySelectorAll("[data-claim-mission]").forEach((btn) => {
    btn.addEventListener("click", () => claimMission(btn));
  });
}

async function claimMission(button) {
  const missionId = button.dataset.claimMission;
  const restore = busy(button, "Claiming");
  try {
    const res = await api("/api/member/mission-claim", { method: "POST", body: { missionId } });
    toast(`Claimed ${num(res.reward.amount)} ${res.reward.unit}.`, { type: "success", title: "Mission reward" });
    await Promise.all([loadOverview(), loadMissions()]);
  } catch (err) {
    toast(err.message, { type: "error", title: "Could not claim" });
  } finally {
    restore();
  }
}

async function loadMissions() {
  const host = document.getElementById("missions-list");
  host.innerHTML = `<div class="skeleton" style="height:96px"></div>`;
  try {
    const data = await api("/api/member/missions");
    state.missions = data.missions || [];
    renderMissions();
  } catch (err) {
    if (handleAuthError(err)) return;
    host.innerHTML = errorState(err.message);
  }
}

/* ── Catalogue + redemption ──────────────────────────────────────────────── */

function renderCatalogue() {
  const grid = document.getElementById("redeem-grid");
  if (!state.catalogue) return;

  const items = state.catalogueTab === "points" ? state.catalogue.catalogue : state.catalogue.shop;
  if (!items.length) {
    grid.className = "";
    grid.innerHTML = emptyState("Nothing available yet", "This catalogue has not been stocked yet.");
    return;
  }

  grid.className = "grid grid-2";
  grid.innerHTML = items
    .map((i) => {
      const disabled = !i.eligible || !i.affordable;
      let reason = "";
      if (!i.inStock) reason = "Out of stock";
      else if (i.requiresTier && !i.eligible) reason = `Requires ${i.requiresTier} status`;
      else if (!i.affordable) reason = "Insufficient balance";

      return `
      <article class="card">
        <div class="between" style="align-items:flex-start;gap:var(--s3)">
          <h3 class="card-title" style="margin:0">${esc(i.displayName)}</h3>
          <span class="mono" style="font-weight:600;color:var(--brand-red);white-space:nowrap">${num(i.price)} ${esc(i.unit)}</span>
        </div>
        <p class="card-body mt-2">${esc(i.description || "No description provided.")}</p>
        <div class="flex gap-2 wrap mt-4">
          <span class="badge ${i.fulfillment === "instant" ? "badge-success" : "badge-info"}">
            ${i.fulfillment === "instant" ? "Granted immediately" : "Needs staff review"}
          </span>
          ${i.stock !== null ? `<span class="badge ${i.inStock ? "badge-neutral" : "badge-danger"}">${i.inStock ? `${num(i.stock)} left` : "Out of stock"}</span>` : ""}
        </div>
        <button class="btn ${disabled ? "btn-secondary" : "btn-primary"} btn-block mt-4"
                data-redeem="${esc(i.id)}" ${disabled ? "disabled" : ""}>
          ${disabled ? esc(reason) : "Redeem"}
        </button>
      </article>`;
    })
    .join("");

  grid.querySelectorAll("[data-redeem]").forEach((b) => b.addEventListener("click", openRedeem));
}

async function loadCatalogue() {
  const grid = document.getElementById("redeem-grid");
  grid.innerHTML = `<div class="skeleton" style="height:170px"></div><div class="skeleton" style="height:170px"></div>`;
  try {
    state.catalogue = await api("/api/member/catalogue");
    renderCatalogue();
  } catch (err) {
    if (handleAuthError(err)) return;
    grid.className = "";
    grid.innerHTML = errorState(err.message);
  }
}

function openRedeem(e) {
  const itemId = e.currentTarget.dataset.redeem;
  const item = [...(state.catalogue.catalogue || []), ...(state.catalogue.shop || [])].find((i) => i.id === itemId);
  if (!item) return;

  const balance = state.catalogue.balance
    ? item.currency === "credits"
      ? state.catalogue.balance.credits
      : state.catalogue.balance.points
    : 0;

  state.pendingRedeem = { id: item.id, name: item.displayName, price: item.price, unit: item.unit, balance, fulfillment: item.fulfillment };

  const dlg = document.getElementById("redeem-dialog");
  document.getElementById("redeem-receipt").innerHTML = `
    <div class="receipt-row"><dt>Item</dt><dd>${esc(item.displayName)}</dd></div>
    <div class="receipt-row"><dt>Cost</dt><dd>${num(item.price)} ${esc(item.unit)}</dd></div>
    <div class="receipt-row"><dt>Balance now</dt><dd>${num(balance)} ${esc(item.unit)}</dd></div>
    <div class="receipt-row"><dt>Balance after</dt><dd>${num(balance - item.price)} ${esc(item.unit)}</dd></div>`;
  document.getElementById("redeem-error").hidden = true;
  dlg.showModal();
}

async function confirmRedeem() {
  const dlg = document.getElementById("redeem-dialog");
  const errBox = document.getElementById("redeem-error");
  const btn = document.getElementById("redeem-confirm");
  if (!state.pendingRedeem) return;

  const restore = busy(btn, "Processing");
  errBox.hidden = true;

  try {
    // A nonce keeps a genuine second attempt distinct while a duplicate
    // submission of the same click is deduplicated server-side.
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const res = await api("/api/member/redeem", {
      method: "POST",
      body: { itemId: state.pendingRedeem.id, nonce },
    });
    dlg.close();
    toast(res.message, { type: "success", title: res.duplicate ? "Already processed" : "Redemption submitted" });
    state.pendingRedeem = null;
    await Promise.all([loadOverview(), loadCatalogue()]);
  } catch (err) {
    if (handleAuthError(err)) {
      dlg.close();
      return;
    }
    errBox.textContent = err.message;
    errBox.hidden = false;
  } finally {
    restore();
  }
}

/* ── Tabs ────────────────────────────────────────────────────────────────── */

const TABS = ["activity", "flights", "missions", "redeem", "profile"];
const LOADERS = { activity: loadHistory, flights: loadFlights, missions: loadMissions, redeem: loadCatalogue, profile: async () => {} };
const loaded = new Set();

function selectTab(name) {
  for (const t of TABS) {
    const tab = document.getElementById(`tab-${t}`);
    const panel = document.getElementById(`panel-${t}`);
    const active = t === name;
    tab.setAttribute("aria-selected", String(active));
    panel.hidden = !active;
  }
  if (!loaded.has(name)) {
    loaded.add(name);
    LOADERS[name]();
  }
}

function wireTabs() {
  for (const t of TABS) {
    const tab = document.getElementById(`tab-${t}`);
    tab.addEventListener("click", () => selectTab(t));
    tab.addEventListener("keydown", (e) => {
      const i = TABS.indexOf(t);
      if (e.key === "ArrowRight") { document.getElementById(`tab-${TABS[(i + 1) % TABS.length]}`).focus(); selectTab(TABS[(i + 1) % TABS.length]); }
      if (e.key === "ArrowLeft") { document.getElementById(`tab-${TABS[(i - 1 + TABS.length) % TABS.length]}`).focus(); selectTab(TABS[(i - 1 + TABS.length) % TABS.length]); }
    });
  }
}

/* ── Boot ────────────────────────────────────────────────────────────────── */

async function main() {
  await boot();
  setTitle("My dashboard");

  const s = currentSession();
  if (!s.authenticated) {
    renderSignedOut();
    return;
  }

  document.getElementById("signed-in").hidden = false;

  wireTabs();
  document.getElementById("profile-signout").addEventListener("click", handleSignOut);

  document.getElementById("hist-currency").addEventListener("change", async (e) => {
    state.history.currency = e.target.value;
    await loadHistory(1);
  });
  document.getElementById("hist-prev").addEventListener("click", () => loadHistory(state.history.page - 1));
  document.getElementById("hist-next").addEventListener("click", () => loadHistory(state.history.page + 1));

  document.getElementById("cat-points-tab").addEventListener("click", (e) => {
    state.catalogueTab = "points";
    e.currentTarget.setAttribute("aria-selected", "true");
    document.getElementById("cat-credits-tab").setAttribute("aria-selected", "false");
    renderCatalogue();
  });
  document.getElementById("cat-credits-tab").addEventListener("click", (e) => {
    state.catalogueTab = "credits";
    e.currentTarget.setAttribute("aria-selected", "true");
    document.getElementById("cat-points-tab").setAttribute("aria-selected", "false");
    renderCatalogue();
  });

  const dlg = document.getElementById("redeem-dialog");
  dlg.querySelectorAll("[data-redeem-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
  document.getElementById("redeem-confirm").addEventListener("click", confirmRedeem);

  try {
    await loadOverview();
    await loadHistory(1);
  } catch (err) {
    if (/sign in/i.test(err.message)) {
      renderSignedOut();
      return;
    }
    toast(err.message, { type: "error" });
  }
}

main();