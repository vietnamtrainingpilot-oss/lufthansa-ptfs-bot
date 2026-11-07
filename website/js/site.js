/**
 * site.js — Shared frontend runtime for every VietJet PTFS page.
 *
 * Responsibilities:
 *  - Render the header and footer so pages stay consistent and DRY.
 *  - Own the session state (fetched from the server, never trusted from input).
 *  - Provide a small API client with safe error handling.
 *  - Provide toast, dialog and formatting helpers.
 *
 * SECURITY: no secrets live in this file. All member data comes from
 * same-origin endpoints that derive identity from the session cookie.
 */

/* ── Configuration ───────────────────────────────────────────────────────── */

export const CONFIG = {
  // Discord invite. Loaded from the server at runtime (see loadSiteConfig) so
  // the owner can change it in .env without editing this file. The value here
  // is only a fallback for when the config endpoint is unavailable.
  discordInviteUrl: "https://discord.gg/vietjetptfs",
};

/**
 * Fetch public site configuration from the server.
 *
 * Only non-secret presentation values live here (currently just the Discord
 * invite). Member data always comes from the session-gated endpoints.
 *
 * @returns {Promise<typeof CONFIG>}
 */
export async function loadSiteConfig() {
  try {
    const res = await fetch("/api/site/config", { headers: { accept: "application/json" } });
    if (!res.ok) return CONFIG;
    const data = await res.json();
    if (data && typeof data.discordInviteUrl === "string" && data.discordInviteUrl) {
      CONFIG.discordInviteUrl = data.discordInviteUrl;
    }
  } catch {
    // Keep the fallback value.
  }
  return CONFIG;
}

/* ── Formatting ──────────────────────────────────────────────────────────── */

export function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function num(n) {
  return Number(n ?? 0).toLocaleString("en-US");
}

export function formatDate(value, opts = {}) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", ...opts });
}

export function formatDateTime(value) {
  return formatDate(value, { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return "—";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h && rem) return `${h}h ${rem}m`;
  return h ? `${h}h` : `${rem}m`;
}

/** Extract the IATA-style code from a label such as "HAN (Hanoi)". */
export function airportCode(label) {
  const m = String(label || "").match(/\(([A-Z]{3,4})\)/);
  return m ? m[1] : String(label || "—").slice(0, 4).toUpperCase();
}

export function airportName(label) {
  const m = String(label || "").match(/\(([^)]+)\)/);
  return m ? m[1] : String(label || "");
}

/* ── Session ─────────────────────────────────────────────────────────────── */

let sessionPromise = null;
let session = { authenticated: false, authConfigured: true, member: null };

/** Fetch (once) and cache the current session. */
export function getSession() {
  if (!sessionPromise) {
    sessionPromise = fetch("/api/session", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : { authenticated: false, authConfigured: false }))
      .catch(() => ({ authenticated: false, authConfigured: false }))
      .then((data) => {
        session = data;
        return session;
      });
  }
  return sessionPromise;
}

export function currentSession() {
  return session;
}

export function isSignedIn() {
  return !!session.authenticated;
}

/* ── API client ──────────────────────────────────────────────────────────── */

/**
 * Fetch JSON with consistent error handling.
 * Throws an Error carrying the server's safe message.
 */
export async function api(path, { method = "GET", body = null, signal } = {}) {
  const opts = {
    method,
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    signal,
  };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, opts);
  } catch (e) {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status}).`);
    // Attach the status so callers can distinguish an expired session (401)
    // from a genuine server or network failure.
    err.status = res.status;
    throw err;
  }
  return data ?? {};
}

/**
 * Forget the cached session so the next getSession() re-fetches it.
 * Used when the server reports the session is no longer valid.
 */
export function resetSession() {
  sessionPromise = null;
  session = { authenticated: false, authConfigured: true, member: null };
}

/* ── Icons (inline SVG, no emoji) ────────────────────────────────────────── */

export const ICONS = {
  arrowRight: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  arrowUpRight: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M8 7h9v9"/></svg>',
  plane: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-.9 1.7l5.7 3.4-2 2-2.6-.6a.6.6 0 0 0-.6.9l2 2.9-1.3 1.3-1.6-.4a.6.6 0 0 0-.6.9L6 19l1.8.4a.6.6 0 0 0 .8-.4l1.3-1.3 2.9 2a.6.6 0 0 0 .9-.6l-.4-1.6 1.3-1.3 3.4 5.7a1 1 0 0 0 1.7-.9Z"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  logout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  user: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  home: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="m9 22 9-10 9 10"/></svg>',
  ticket: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/></svg>',
  refresh: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
};

/* ── Chrome: header + footer ────────────────────────────────────────────── */

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/flights.html", label: "Flights" },
  { href: "/rewards.html", label: "Rewards" },
  { href: "/careers.html", label: "Careers" },
  { href: "/affiliates.html", label: "Affiliates" },
  { href: "/support.html", label: "Support" },
];

const COMMUNITY_RULES = [
  "Be respectful to every member",
  "No spam or excessive tagging",
  "No NSFW content anywhere",
  "No unauthorised advertising",
  "Follow staff instructions",
  "No harassment or discrimination",
  "Use channels appropriately",
  "No impersonation or scams",
  "No real-money trading of points or credits",
  "Follow the Discord Terms of Service",
];

function brandMarkup(inverse = false) {
  return `
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M16 2.5 4 9.5v13l12 7 12-7v-13L16 2.5Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
        <path d="M16 7.5v8.5M9.5 15h13" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" opacity=".75"/>
      </svg>
    </span>
    <span class="brand-text">
      <span class="brand-name">VietJet PTFS</span>
      <span class="brand-sub">Virtual Airline</span>
    </span>`;
}

function renderAccountArea() {
  const s = currentSession();
  if (s.authenticated && s.member) {
    const initial = (s.member.globalName || s.member.username || "?").charAt(0).toUpperCase();
    return `
      <div class="account">
        <button class="account-trigger" id="account-trigger" aria-expanded="false" aria-haspopup="true" aria-controls="account-menu">
          <span class="avatar" aria-hidden="true">${esc(initial)}</span>
          <span class="account-name">${esc(s.member.globalName || s.member.username)}</span>
        </button>
        <div class="account-menu" id="account-menu" hidden role="menu">
          <div class="account-menu-head">
            <div style="font-weight:600;font-size:var(--t-sm)">${esc(s.member.globalName || s.member.username)}</div>
            <div class="account-menu-id">${esc(s.member.id)}</div>
          </div>
          <a class="menu-item" href="/dashboard.html" role="menuitem">${ICONS.user}<span>My dashboard</span></a>
          <a class="menu-item" href="/rewards.html" role="menuitem">${ICONS.ticket}<span>Rewards catalogue</span></a>
          <div class="menu-sep"></div>
          <button class="menu-item" id="signout-btn" role="menuitem">${ICONS.logout}<span>Sign out</span></button>
        </div>
      </div>`;
  }

  if (!s.authConfigured) {
    return `<span class="badge badge-warning" title="Discord sign-in is not configured on this server">Sign-in unavailable</span>`;
  }
  return `<a class="btn btn-primary btn-sm" href="/auth/login">Sign in</a>`;
}

export function mountHeader() {
  const host = document.getElementById("site-header");
  if (!host) return;
  const current = location.pathname === "/" ? "/" : location.pathname.replace(/^\//, "/").split("?")[0];

  host.innerHTML = `
    <div class="container site-header-inner">
      <a class="brand" href="/" aria-label="VietJet PTFS home">${brandMarkup()}</a>
      <nav class="nav" id="primary-nav" aria-label="Primary">
        ${NAV_ITEMS.map((i) => {
          const active = current === i.href || (i.href !== "/" && current.startsWith(i.href.replace(".html", "")));
          return `<a class="nav-link" href="${i.href}"${active ? ' aria-current="page"' : ""}>${esc(i.label)}</a>`;
        }).join("")}
      </nav>
      <div class="nav-actions">
        <div id="account-area">${renderAccountArea()}</div>
        <a class="btn btn-primary btn-sm hide-sm" href="${CONFIG.discordInviteUrl}" target="_blank" rel="noopener">Join Discord</a>
        <button class="nav-toggle" id="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="primary-nav">
          ${ICONS.menu}
        </button>
      </div>
    </div>`;

  // Mobile nav: visibility is driven by data-open so CSS alone decides the
  // default (hidden on small screens, always visible on desktop).
  const nav = host.querySelector("#primary-nav");
  const toggle = host.querySelector("#nav-toggle");
  if (toggle && nav) {
    const setOpen = (open) => {
      nav.dataset.open = String(open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    setOpen(false);
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(nav.dataset.open !== "true");
    });
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a") && window.matchMedia("(max-width: 900px)").matches) {
        setOpen(false);
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.dataset.open === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  // Account menu
  const trigger = host.querySelector("#account-trigger");
  const menu = host.querySelector("#account-menu");
  if (trigger && menu) {
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== trigger) {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.hidden) {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        trigger.focus();
      }
    });
  }

  const signout = host.querySelector("#signout-btn");
  if (signout) signout.addEventListener("click", handleSignOut);

  // Re-render when the session resolves (skeleton state first).
  if (!sessionPromiseResolved()) {
    getSession().then(() => {
      const area = host.querySelector("#account-area");
      if (area) area.innerHTML = renderAccountArea();
      const so = host.querySelector("#signout-btn");
      if (so) so.addEventListener("click", handleSignOut);
      const t = host.querySelector("#account-trigger");
      const m = host.querySelector("#account-menu");
      if (t && m) {
        t.addEventListener("click", (e) => {
          e.stopPropagation();
          const open = m.hidden;
          m.hidden = !open;
          t.setAttribute("aria-expanded", String(open));
        });
        document.addEventListener("click", (e) => {
          if (!m.hidden && !m.contains(e.target) && e.target !== t) {
            m.hidden = true;
            t.setAttribute("aria-expanded", "false");
          }
        });
      }
    });
  }
}

function sessionPromiseResolved() {
  return session.authenticated || !session.authConfigured;
}

export async function handleSignOut() {
  try {
    await api("/api/signout", { method: "POST" });
  } catch {
    // Even if the call fails we reload, so the UI never shows a stale session.
  }
  session = { authenticated: false, authConfigured: true, member: null };
  sessionPromise = Promise.resolve(session);
  location.href = "/";
}

export function mountFooter() {
  const host = document.getElementById("site-footer");
  if (!host) return;
  const year = new Date().getFullYear();
  host.innerHTML = `
    <div class="container">
      <div class="footer-main">
        <div class="footer-brand">
          <span class="brand">${brandMarkup(true)}</span>
          <p class="footer-about">
            A community-run virtual airline for Roblox Pilot To Server. Fly scheduled routes,
            join the crew, and earn rewards for verified flights.
          </p>
          <p class="mt-4"><a class="btn btn-outline-inverse btn-sm" href="${CONFIG.discordInviteUrl}" target="_blank" rel="noopener">Join the Discord</a></p>
        </div>
        <div class="footer-col">
          <h3>Fly with us</h3>
          <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/flights.html">Flights and booking</a></li>
            <li><a href="/rewards.html">Rewards</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h3>Community</h3>
          <ul>
            <li><a href="/careers.html">Careers</a></li>
            <li><a href="/affiliates.html">Affiliates</a></li>
            <li><a href="/support.html">Support and policies</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h3>Account</h3>
          <ul>
            <li><a href="/dashboard.html">My dashboard</a></li>
            <li><a href="/support.html#bookings">Track a booking</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-rules">
        <h3>Community rules</h3>
        <ol>${COMMUNITY_RULES.map((r) => `<li>${esc(r)}</li>`).join("")}</ol>
      </div>
      <div class="footer-legal">
        <p>
          VietJet PTFS is an unofficial fan community for Roblox Pilot To Server. It is not
          affiliated with, endorsed by, or operated by VietJet Air. All routes, staff and
          rewards are fictional and hold no cash value.
        </p>
        <p>&copy; ${year} VietJet PTFS</p>
      </div>
    </div>`;
}

/* ── Toast ───────────────────────────────────────────────────────────────── */

function toastRegion() {
  let r = document.getElementById("toast-region");
  if (!r) {
    r = document.createElement("div");
    r.id = "toast-region";
    r.className = "toast-region";
    r.setAttribute("role", "status");
    r.setAttribute("aria-live", "polite");
    document.body.appendChild(r);
  }
  return r;
}

export function toast(message, { type = "info", title = null, duration = 5000 } = {}) {
  const region = toastRegion();
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <div class="toast-body">
      ${title ? `<div class="toast-title">${esc(title)}</div>` : ""}
      <div>${esc(message)}</div>
    </div>
    <button class="toast-close" aria-label="Dismiss">${ICONS.close}</button>`;
  el.querySelector(".toast-close").addEventListener("click", () => el.remove());
  region.appendChild(el);
  setTimeout(() => el.remove(), duration);
  return el;
}

/* ── States ──────────────────────────────────────────────────────────────── */

export function skeletonCards(count = 3, height = 180) {
  return Array.from({ length: count })
    .map(() => `<div class="skeleton" style="height:${height}px"></div>`)
    .join("");
}

export function emptyState(title, body, actionHtml = "") {
  return `
    <div class="empty">
      <p class="empty-title">${esc(title)}</p>
      <p class="empty-body">${esc(body)}</p>
      ${actionHtml ? `<div class="mt-6">${actionHtml}</div>` : ""}
    </div>`;
}

export function errorState(message, retryAttr = "") {
  return `
    <div class="empty">
      <p class="empty-title">Something went wrong</p>
      <p class="empty-body">${esc(message)}</p>
      ${retryAttr ? `<div class="mt-6"><button class="btn btn-secondary btn-sm" ${retryAttr}>Try again</button></div>` : ""}
    </div>`;
}

/* ── Busy button helper ──────────────────────────────────────────────────── */

/**
 * Disable a button and show a spinner while an async action runs.
 * Returns a function that restores the original state.
 */
export function busy(button, label = "Working") {
  const original = button.innerHTML;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${esc(label)}</span>`;
  return () => {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.innerHTML = original;
  };
}

/* ── Boot ────────────────────────────────────────────────────────────────── */

/** Mount the shared chrome and resolve the session before page code runs. */
export async function boot() {
  // Load public site config BEFORE mounting, so the header and footer render
  // the owner-configured Discord invite rather than the fallback.
  await loadSiteConfig();

  // Any element that opts into the invite via data-invite picks it up here, so
  // a page can carry a Discord call to action without hardcoding the URL.
  for (const el of document.querySelectorAll("[data-invite]")) {
    el.setAttribute("href", CONFIG.discordInviteUrl);
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener");
  }

  mountHeader();
  mountFooter();
  await getSession();
  const area = document.getElementById("account-area");
  if (area) area.innerHTML = renderAccountArea();
  const so = document.getElementById("signout-btn");
  if (so) so.addEventListener("click", handleSignOut);

  // Wire the mobile account dropdown after re-render.
  const trigger = document.getElementById("account-trigger");
  const menu = document.getElementById("account-menu");
  if (trigger && menu && !trigger.dataset.wired) {
    trigger.dataset.wired = "1";
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== trigger) {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.hidden) {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        trigger.focus();
      }
    });
  }

  // Scroll-reveal: wire IntersectionObserver once per page.
  initRevealObserver();
}

/* ── Scroll reveal ------------------------------------------------------- */

let _revealObserver = null;

function initRevealObserver() {
  if (_revealObserver) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const roots = document.querySelectorAll(".reveal");
  if (!roots.length) return;

  _revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          _revealObserver.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  for (const el of roots) _revealObserver.observe(el);
}

/** Set the document title suffix consistently. */
export function setTitle(title) {
  document.title = `${title} · VietJet PTFS`;
}