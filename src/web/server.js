/**
 * server.js — Express app factory for the Lufthansa PTFS website and API.
 *
 * Responsibilities:
 *  - Serve the static site from `website/`.
 *  - Host the Discord OAuth2 sign-in routes.
 *  - Host the public and member API under /api.
 *  - Keep every private route gated on a verified session.
 *
 * The member identity is always read from the session cookie. No private route
 * accepts a user id from the client.
 */

import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidFlightNumber, normalizeFlightNumber } from "../config/brand.js";

import {
  resolveAuthConfig,
  beginLogin,
  completeLogin,
  clearSessionCookie,
  avatarUrl,
  COOKIE_SESSION,
} from "./auth.js";
import {
  attachMember,
  meHandler,
  overviewHandler,
  historyHandler,
  flightsHandler,
  catalogueHandler,
  missionsHandler,
  redeemHandler,
  missionClaimHandler,
} from "./memberRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, "..", "..", "website");

/** Small fixed-window rate limiter for auth endpoints. */
function rateLimit({ windowMs, max, key = (req) => req.ip }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const k = key(req);
    const entry = hits.get(k);
    if (!entry || now > entry.reset) {
      hits.set(k, { count: 1, reset: now + windowMs });
      return next();
    }
    if (entry.count >= max) {
      const wait = Math.ceil((entry.reset - now) / 1000);
      res.set("Retry-After", String(wait));
      return res.status(429).json({ error: `Too many attempts. Please try again in ${wait} seconds.` });
    }
    entry.count++;
    return next();
  };
}

/**
 * Decide whether the connection is TLS-terminated in front of us.
 * Behind a reverse proxy or tunnel, trust X-Forwarded-Proto.
 */
function isSecure(req, authCfg) {
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  if (proto === "https") return true;
  if (proto === "http") return false;
  if (authCfg.publicBaseUrl?.startsWith("https://")) return true;
  return req.secure === true;
}

/**
 * Build the Express application.
 *
 * @param {object} options
 * @param {object} options.config — the app config module (for optional keys)
 * @param {object} [options.discordClient] — logged-in client, used to notify the
 *   member and staff after a booking. Omit in tests.
 * @returns {import('express').Express}
 */
export function createWebApp({ config, discordClient = null }) {
  const authCfg = resolveAuthConfig(config);
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", true);

  // Health endpoint (lightweight, no auth, no DB)
  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "lufthansa-ptfs" }));

  // Baseline security headers. A CSP is set that allows only same-origin
  // scripts/styles plus the Discord avatar CDN and Google Fonts, so no
  // third-party script can be injected.
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        // Scripts stay strict (no inline, no eval). Styles allow inline because
        // progress-bar widths and similar values are set via style attributes.
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https://cdn.discordapp.com",
        "connect-src 'self'",
        "form-action 'self' https://discord.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "object-src 'none'",
      ].join("; ")
    );
    if (isSecure(req, authCfg)) {
      res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    next();
  });

  app.use(express.json({ limit: "32kb" }));

  // Attach the session to every request so both public and private routes can use it.
  app.use((req, _res, next) => {
    if (authCfg.configured) attachMember(req, authCfg.sessionSecret);
    next();
  });

  /* ── Auth routes ───────────────────────────────────────────────────────── */

  const loginLimiter = rateLimit({ windowMs: 60_000, max: 20 });

  app.get("/auth/login", loginLimiter, (req, res) => {
    if (!authCfg.configured) {
      const missing = authCfg.missing.join(", ");
      return res
        .status(503)
        .type("html")
        .send(notConfiguredPage(missing));
    }
    const secure = isSecure(req, authCfg);
    const { url, cookies } = beginLogin(authCfg, secure);
    for (const c of cookies) res.append("Set-Cookie", c);
    return res.redirect(url);
  });

  const callbackLimiter = rateLimit({ windowMs: 60_000, max: 30 });

  app.get("/auth/callback", callbackLimiter, async (req, res) => {
    if (!authCfg.configured) {
      return res.status(503).type("html").send(notConfiguredPage(authCfg.missing.join(", ")));
    }
    const secure = isSecure(req, authCfg);
    const result = await completeLogin(authCfg, req, req.query, secure);
    for (const c of result.cookies || []) res.append("Set-Cookie", c);

    if (!result.ok) {
      return res.status(result.status).type("html").send(messagePage("Sign-in could not be completed", result.error));
    }

    // Redirect into the app. The target is fixed, never taken from the query,
    // so this cannot be used as an open redirect.
    return res.redirect("/dashboard.html");
  });

  /* ── Session API ───────────────────────────────────────────────────────── */

  app.get("/api/session", meHandler(authCfg));

  app.post("/api/signout", (req, res) => {
    const secure = isSecure(req, authCfg);
    res.append("Set-Cookie", clearSessionCookie(secure));
    res.json({ ok: true });
  });

  /* ── Public API ────────────────────────────────────────────────────────── */

  // Public site configuration. The Discord invite lives here (not hardcoded in
  // browser JS) so the owner can change it in .env without editing the site.
  app.get("/api/site/config", (_req, res) => {
    res.json({
      discordInviteUrl: config.discordInviteUrl || null,
    });
  });

  app.get("/api/flights/active", async (req, res) => {
    try {
      const { getDb } = await import("../services/firestore.js");
      const db = getDb();
      const snap = await db
        .collection("flights")
        .where("status", "in", ["scheduled", "checkin"])
        .orderBy("scheduledUnixTime", "asc")
        .limit(50)
        .get();

      res.json({
        flights: snap.docs.map((d) => {
          const f = d.data();
          return {
            id: d.id,
            flightNumber: f.flightNumber,
            departureAirport: f.departureAirport,
            arrivalAirport: f.arrivalAirport,
            aircraft: f.aircraft,
            classes: f.classes,
            flightTimeMinutes: f.flightTimeMinutes,
            scheduledUnixTime: f.scheduledUnixTime,
            status: f.status,
          };
        }),
      });
    } catch (e) {
      console.error("[web] active flights failed:", e.message);
      res.status(503).json({ error: "Flight information is temporarily unavailable." });
    }
  });

  app.get("/api/loyalty/public", async (req, res) => {
    try {
      const [{ getLoyaltyConfig }, catalogue, { qualifyingMetricLabel }] = await Promise.all([
        import("../services/loyaltyStore.js"),
        import("../services/catalogue.js"),
        import("../services/tierRules.js"),
      ]);
      const cfg = await getLoyaltyConfig();
      const [pointsItems, creditItems] = await Promise.all([
        catalogue.listItems({ currency: "points" }),
        catalogue.listItems({ currency: "credits" }),
      ]);

      res.json({
        branding: cfg.branding,
        tiers: cfg.tiers.list.map((t) => ({ key: t.key, name: t.name, min: t.min })),
        qualifyingMetric: cfg.qualifyingMetric,
        qualifyingMetricLabel: qualifyingMetricLabel(cfg),
        catalogue: pointsItems.map((i) => ({
          id: i.id,
          displayName: i.displayName,
          description: i.description,
          price: i.price,
          stock: i.stock ?? null,
          requiresTier: i.eligibility?.minTierKey ?? null,
        })),
        shop: creditItems.map((i) => ({
          id: i.id,
          displayName: i.displayName,
          description: i.description,
          price: i.price,
          stock: i.stock ?? null,
        })),
        rates: {
          pointsPer100km: cfg.formula.pointsPer100km,
          pointsPerMinuteFallback: cfg.formula.pointsPerMinuteFallback,
          minPointsPerFlight: cfg.formula.minPointsPerFlight,
          maxPointsPerFlight: cfg.formula.maxPointsPerFlight,
          creditsPerHour: cfg.creditsFormula.creditsPerHour,
          minCreditsPerFlight: cfg.creditsFormula.minCreditsPerFlight,
          maxCreditsPerFlight: cfg.creditsFormula.maxCreditsPerFlight,
          classMultipliers: cfg.formula.classMultipliers,
        },
      });
    } catch (e) {
      console.error("[web] public loyalty failed:", e.message);
      res.status(503).json({ error: "Loyalty information is temporarily unavailable." });
    }
  });

  /* ── Booking ───────────────────────────────────────────────────────────── */

  const handleBooking = async (req, res) => {
    try {
      const result = await recordBooking(req.body);
      if (result.status === 200) {
        // The seat is recorded. Notify the member and staff, but never let a
        // Discord failure turn a successful booking into an error response.
        notifyBooking(discordClient, config, result.payload.booking).catch((e) =>
          console.error("[web] booking notification failed:", e.message)
        );
      }
      return res.status(result.status).json(result.payload);
    } catch (e) {
      console.error("[web] booking failed:", e.message);
      res.status(500).json({ error: "The booking could not be recorded. Please try again." });
    }
  };

  // Guest booking is allowed by design (the site shows the Discord ID field), so
  // this endpoint cannot require a session. That makes it a target for manifest
  // spam, so it is rate limited per IP. A booking still cannot earn a reward on
  // its own: presenceStatus is hard-coded to "unmarked" and only staff can set
  // it to "present".
  app.post("/api/bookings", rateLimit({ windowMs: 60_000, max: 5 }), handleBooking);

  // The original server-to-server booking contract, kept so an externally
  // hosted booking page (or a legacy front end) keeps working. It is guarded by
  // the shared secret; the browser-facing /api/bookings is not, because it is
  // same-origin and carries no privileged action.
  app.post("/webhook/booking", requireWebhookSecret(config), handleBooking);

  /* ── Member API (session-gated) ────────────────────────────────────────── */

  const gate = (handler) => (req, res) => {
    if (!authCfg.configured || !req.member) {
      return res.status(401).json({ error: "Sign in to view this information." });
    }
    return handler(req, res);
  };

  app.get("/api/member/overview", gate(overviewHandler));
  app.get("/api/member/history", gate(historyHandler));
  app.get("/api/member/flights", gate(flightsHandler));
  app.get("/api/member/missions", gate(missionsHandler));
  app.get("/api/member/catalogue", gate(catalogueHandler));
  app.post("/api/member/redeem", gate(redeemHandler));
  app.post("/api/member/mission-claim", gate(missionClaimHandler));

  /* ── Static site ───────────────────────────────────────────────────────── */

  app.use(
    express.static(SITE_DIR, {
      extensions: ["html"],
      setHeaders(res, filePath) {
        if (/\.(css|js|svg|png|jpg|webp|woff2?)$/.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=3600");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    })
  );

  // Unknown /api routes must not fall through to the static handler.
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

  return app;
}

/* ── Booking helper (shared with the bot process) ─────────────────────────── */

async function recordBooking(body) {
  const flightNumber = typeof body?.flightNumber === "string" ? body.flightNumber.trim().slice(0, 32) : null;
  const discordUserId = typeof body?.discordUserId === "string" ? body.discordUserId.trim() : null;
  const seatClassRaw = typeof body?.class === "string" ? body.class.trim().toLowerCase().slice(0, 20) : "economy";
  const seat = typeof body?.seat === "string" ? body.seat.trim().slice(0, 8) : null;

  if (!flightNumber) return { status: 400, payload: { error: "A flight is required." } };
  // The booking page posts the stored bare numeral ("123"); staff and API
  // callers may use the brand format ("LH 123" / "LH123"). An alphanumeric
  // value must carry the brand prefix; anything else (including the legacy
  // VJ prefix) is rejected so no flight outside the brand catalogue can be
  // booked.
  const trimmedFlightNumber = flightNumber.trim();
  const hasLetterPrefix = /^[A-Za-z]{2}/.test(trimmedFlightNumber);
  const bareFlightNumber = normalizeFlightNumber(flightNumber);
  const flightNumberOk = hasLetterPrefix
    ? isValidFlightNumber(trimmedFlightNumber)
    : /^\d{3,4}$/.test(bareFlightNumber);
  if (!flightNumberOk) {
    return { status: 400, payload: { error: "Enter the flight number exactly as shown, for example LH 123." } };
  }
  if (!discordUserId || !/^\d{15,22}$/.test(discordUserId)) {
    return { status: 400, payload: { error: "Enter your Discord user ID. To find it, enable Developer Mode in Discord settings, then right-click your profile and choose Copy User ID." } };
  }
  const allowed = ["economy", "premium", "premium_economy", "premium economy", "business"];
  if (!allowed.includes(seatClassRaw)) {
    return { status: 400, payload: { error: "Choose a valid cabin class." } };
  }

  const { getDb } = await import("../services/firestore.js");
  const db = getDb();
  const snap = await db.collection("flights").where("flightNumber", "==", bareFlightNumber).limit(1).get();
  if (snap.empty) return { status: 404, payload: { error: "That flight is not currently open for booking." } };

  const flight = { id: snap.docs[0].id, ...snap.docs[0].data() };
  if (!["scheduled", "checkin"].includes(flight.status)) {
    return { status: 409, payload: { error: "That flight is no longer accepting bookings." } };
  }

  const manifest = await import("../services/manifest.js");
  await manifest.ensureManifest(flight.id, {
    flightNumber: flight.flightNumber,
    departure: flight.departureAirport,
    arrival: flight.arrivalAirport,
  });

  // Idempotent per (flight, member): a repeat submission updates the same row.
  await manifest.upsertPassenger(flight.id, {
    userId: discordUserId,
    cabinClass: seatClassRaw.replace(/[\s_]/g, "_") === "premium_economy" ? "premium" : seatClassRaw.replace(/[\s_]/g, "_"),
    seat,
    bookingId: `web-${flightNumber}-${discordUserId}`,
    bookingStatus: "confirmed",
    presenceStatus: "unmarked",
    eligible: true,
  });

  return {
    status: 200,
    payload: {
      ok: true,
      flightNumber,
      message: "Seat request recorded. Rewards are awarded after the flight is completed and your attendance is confirmed.",
      booking: {
        userId: discordUserId,
        flightId: flight.id,
        flightNumber,
        departure: flight.departureAirport,
        arrival: flight.arrivalAirport,
        departureTime: flight.departureTime ?? null,
        cabinClass: seatClassRaw.replace(/[\s_]/g, "_") === "premium_economy" ? "premium" : seatClassRaw.replace(/[\s_]/g, "_"),
        seat,
      },
    },
  };
}

/**
 * Guard for the server-to-server booking webhook.
 *
 * Fails closed: if no secret is configured the route refuses every request
 * rather than accepting unauthenticated writes.
 */
function requireWebhookSecret(config) {
  const secret = config?.bookingWebhookSecret;
  return (req, res, next) => {
    if (!secret) {
      return res.status(503).json({ error: "The booking webhook is not configured." });
    }
    const provided = req.get("x-webhook-secret") || "";
    const a = Buffer.from(String(provided));
    const b = Buffer.from(String(secret));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: "Unauthorized." });
    }
    return next();
  };
}

/**
 * Best-effort Discord notifications after a booking is recorded.
 *
 * DM the member a confirmation and post the booking to the flight-ops log so
 * staff see it. Every failure is swallowed: a Discord outage must never turn a
 * booking that is already saved in Firestore into a failed request.
 */
async function notifyBooking(client, config, booking) {
  if (!client || !booking) return;

  const label = `${booking.flightNumber} (${booking.departure} to ${booking.arrival})`;

  try {
    const user = await client.users.fetch(booking.userId);
    await user.send(
      [
        "Seat request confirmed.",
        `Flight: ${label}`,
        booking.seat ? `Seat: ${booking.seat}` : null,
        `Cabin: ${String(booking.cabinClass).replace(/_/g, " ")}`,
        "",
        "Rewards are awarded after the flight is completed and your attendance is confirmed by staff.",
      ]
        .filter(Boolean)
        .join("\n")
    );
  } catch {
    // The member may have DMs closed. The booking is still recorded.
  }

  const channelId = config.flightBookingStaffChannelId || config.bookingLogChannelId || config.flightLogChannelId;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased?.()) return;
    await channel.send(
      `Seat booked - ${label} - member <@${booking.userId}> - ${String(booking.cabinClass).replace(/_/g, " ")}${booking.seat ? ` - seat ${booking.seat}` : ""}`
    );
  } catch {
    // Log channel misconfigured or unavailable; never fail the request.
  }
}

/* ── Small HTML pages for auth outcomes ──────────────────────────────────── */

function pageShell(title, heading, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · Lufthansa PTFS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/site.css">
</head><body>
<main class="section">
  <div class="container container-narrow">
    <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 2.5 4 9.5v13l12 7 12-7v-13L16 2.5Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/></svg></span>
    <h1 class="mt-4" style="font-size:var(--t-3xl)">${heading}</h1>
    ${bodyHtml}
  </div>
</main>
</body></html>`;
}

function messagePage(heading, message) {
  return pageShell(
    heading,
    heading,
    `<p class="mt-4 soft">${message}</p>
     <p class="mt-8"><a class="btn btn-primary" href="/">Back to home</a></p>`
  );
}

function notConfiguredPage(missing) {
  return pageShell(
    "Sign-in unavailable",
    "Sign-in is not configured yet",
    `<div class="alert alert-warning mt-6">
       <p>Member sign-in is unavailable because this server is missing its OAuth configuration. An administrator needs to set the following environment variables and restart the bot:</p>
     </div>
     <pre class="code-block mt-4" style="display:block;white-space:pre-wrap"><code>${missing.split(", ").join("\n")}</code></pre>
     <p class="mt-6 soft">See <code>SETUP_AUTH.md</code> in the repository for the full walkthrough.</p>
     <p class="mt-8"><a class="btn btn-primary" href="/">Back to home</a></p>`
  );
}

export default { createWebApp, recordBooking };
