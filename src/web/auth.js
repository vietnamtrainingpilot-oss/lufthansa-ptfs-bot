/**
 * auth.js — Discord OAuth2 authorization-code flow with signed session cookies.
 *
 * Design notes
 *  - No new dependency. Token exchange and the identity request use the global
 *    `fetch` available in Node 20+. Signatures use `node:crypto`.
 *  - Only the `identify` scope is requested. Email is NOT requested because no
 *    shipped feature needs it.
 *  - The client secret and bot token never leave the server.
 *  - CSRF: a random `state` nonce is issued, stored in a short-lived signed
 *    cookie, and compared on callback with a timing-safe check.
 *  - PKCE (S256) is used in addition to state.
 *  - Sessions are stateless signed cookies holding only the identity claims we
 *    need. Nothing sensitive is stored server-side, so there is no session
 *    store to leak or clean up.
 *  - If OAuth is not configured, `isConfigured()` returns false and the routes
 *    return a clear 503 explaining what is missing. Login is never faked.
 */

import crypto from "node:crypto";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/oauth2/token";
const DISCORD_ME_URL = "https://discord.com/api/v10/users/@me";
const SCOPE = "identify";

// Discord must not be able to hang the callback indefinitely.
const DISCORD_TIMEOUT_MS = 10_000;

// Session lifetime. Short enough to limit exposure, long enough to be usable.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours
const STATE_MAX_AGE_SECONDS = 60 * 10; // 10 minutes

/**
 * Resolve OAuth configuration from the environment.
 * @param {object} config
 */
export function resolveAuthConfig(config) {
  const clientId = process.env.DISCORD_CLIENT_ID || config?.clientId || "";
  const clientSecret = process.env.DISCORD_CLIENT_SECRET || config?.discordOAuthClientSecret || "";
  const sessionSecret = process.env.SESSION_SECRET || config?.websiteSessionSecret || "";
  const publicBaseUrl = (process.env.PUBLIC_BASE_URL || config?.websiteBaseUrl || "").replace(/\/+$/, "");

  let redirectUri = process.env.DISCORD_REDIRECT_URI || "";
  if (!redirectUri && publicBaseUrl) redirectUri = `${publicBaseUrl}/auth/callback`;

  const missing = [];
  // Report the names an operator actually sets in .env (see .env.example), not
  // the internal aliases accepted here as fallbacks.
  if (!clientId) missing.push("DISCORD_CLIENT_ID");
  if (!clientSecret) missing.push("DISCORD_OAUTH_CLIENT_SECRET");
  if (!sessionSecret) missing.push("WEBSITE_SESSION_SECRET");
  if (!redirectUri) missing.push("WEBSITE_BASE_URL (or DISCORD_REDIRECT_URI)");

  return {
    clientId,
    clientSecret,
    sessionSecret,
    redirectUri,
    publicBaseUrl,
    missing,
    configured: missing.length === 0,
  };
}

/* ── Signing helpers ─────────────────────────────────────────────────────── */

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function hmac(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest();
}

/**
 * Sign a payload into a compact `payload.signature` token.
 */
function sign(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(hmac(secret, body))}`;
}

/**
 * Verify and decode a signed token. Returns null when invalid or expired.
 */
function verify(token, secret, maxAgeSeconds) {
  if (typeof token !== "string") return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;

  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);

  const expected = b64url(hmac(secret, body));
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== "number") return null;
  if (Date.now() / 1000 > payload.exp) return null;
  if (maxAgeSeconds && Date.now() / 1000 - payload.iat > maxAgeSeconds) return null;
  return payload;
}

/* ── Cookie helpers ──────────────────────────────────────────────────────── */

export const COOKIE_SESSION = "vjptfs_session";
export const COOKIE_OAUTH_STATE = "vjptfs_oauth_state";

/**
 * Build Set-Cookie header value.
 * `secure` should be true whenever the site is served over HTTPS.
 */
function serializeCookie(name, value, { maxAge, httpOnly = true, sameSite = "Lax", secure = false, path = "/" } = {}) {
  const parts = [`${name}=${value}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (typeof maxAge === "number") parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const pair of String(header).split(";")) {
    const i = pair.indexOf("=");
    if (i < 0) continue;
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/* ── Session model ───────────────────────────────────────────────────────── */

/**
 * Build the signed session token for a Discord identity.
 * Only non-sensitive identity claims are stored.
 */
export function createSessionToken(discordUser, secret) {
  return sign(
    {
      sub: discordUser.id,
      username: discordUser.username,
      global_name: discordUser.global_name || null,
      avatar: discordUser.avatar || null,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
    },
    secret
  );
}

/**
 * Read and verify the session from a request.
 * @returns {{id:string, username:string, global_name:string|null, avatar:string|null}|null}
 */
export function readSession(req, secret) {
  const cookies = parseCookies(req.headers?.cookie);
  const payload = verify(cookies[COOKIE_SESSION], secret, SESSION_MAX_AGE_SECONDS);
  if (!payload || !payload.sub) return null;
  return {
    id: String(payload.sub),
    username: payload.username,
    global_name: payload.global_name,
    avatar: payload.avatar,
  };
}

/** Build the Set-Cookie that clears a session. */
export function clearSessionCookie(secure) {
  return serializeCookie(COOKIE_SESSION, "", { maxAge: 0, secure });
}

/* ── OAuth flow ──────────────────────────────────────────────────────────── */

function base64Sha256(input) {
  return b64url(crypto.createHash("sha256").update(input).digest());
}

/**
 * Start a login: returns the authorize URL plus the cookies that must be set.
 */
export function beginLogin(cfg, secure) {
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = base64Sha256(verifier);

  // The state cookie is signed and short lived, and also carries the PKCE
  // verifier so nothing sensitive sits in the browser beyond an opaque blob.
  const stateCookie = sign(
    {
      state,
      verifier,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + STATE_MAX_AGE_SECONDS,
    },
    cfg.sessionSecret
  );

  const url = new URL(DISCORD_AUTHORIZE_URL);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return {
    url: url.toString(),
    cookies: [serializeCookie(COOKIE_OAUTH_STATE, stateCookie, { maxAge: STATE_MAX_AGE_SECONDS, secure })],
    clearCookies: [serializeCookie(COOKIE_OAUTH_STATE, "", { maxAge: 0, secure })],
  };
}

/**
 * Complete a login: validate state, exchange the code, fetch identity,
 * and return the session token plus cookies.
 *
 * @returns {Promise<{ok:true, sessionToken:string, user:object, cookies:string[]} | {ok:false, error:string, status:number}>}
 */
export async function completeLogin(cfg, req, query, secure) {
  const code = typeof query.code === "string" ? query.code : null;
  const state = typeof query.state === "string" ? query.state : null;

  const cookies = parseCookies(req.headers?.cookie);
  const statePayload = verify(cookies[COOKIE_OAUTH_STATE], cfg.sessionSecret, STATE_MAX_AGE_SECONDS);
  const clearState = [serializeCookie(COOKIE_OAUTH_STATE, "", { maxAge: 0, secure })];

  // Deny if the member declined at the consent screen, or sent no code.
  if (!code && !state) {
    return { ok: false, status: 400, error: "Sign-in was cancelled before it started.", cookies: clearState };
  }
  if (!code) {
    return { ok: false, status: 400, error: "Sign-in did not complete. No authorization code was returned.", cookies: clearState };
  }
  if (!statePayload || !state) {
    return { ok: false, status: 400, error: "Your sign-in session expired or could not be verified. Please try again.", cookies: clearState };
  }
  // Timing-safe state comparison.
  const a = Buffer.from(state);
  const b = Buffer.from(statePayload.state || "");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 400, error: "Sign-in verification failed. Please try again.", cookies: clearState };
  }

  // Authorization-code exchange, server-side only.
  let tokenRes;
  try {
    tokenRes = await fetch(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: cfg.redirectUri,
        code_verifier: statePayload.verifier,
      }),
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 502, error: "Could not reach Discord to complete sign-in. Please try again.", cookies: clearState };
  }

  if (!tokenRes.ok) {
    return { ok: false, status: 502, error: "Discord rejected the sign-in request. Please try again.", cookies: clearState };
  }

  const tokenJson = await tokenRes.json().catch(() => null);
  if (!tokenJson?.access_token) {
    return { ok: false, status: 502, error: "Discord did not return an access token. Please try again.", cookies: clearState };
  }

  // Fetch identity with the `identify` scope only.
  let meRes;
  try {
    meRes = await fetch(DISCORD_ME_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 502, error: "Could not read your Discord profile. Please try again.", cookies: clearState };
  }

  if (!meRes.ok) {
    return { ok: false, status: 502, error: "Could not read your Discord profile. Please try again.", cookies: clearState };
  }

  const me = await meRes.json().catch(() => null);
  if (!me?.id) {
    return { ok: false, status: 502, error: "Discord returned an unexpected profile. Please try again.", cookies: clearState };
  }

  const sessionToken = createSessionToken(me, cfg.sessionSecret);

  return {
    ok: true,
    sessionToken,
    user: { id: me.id, username: me.username, global_name: me.global_name || null, avatar: me.avatar || null },
    cookies: [
      ...clearState,
      serializeCookie(COOKIE_SESSION, sessionToken, {
        maxAge: SESSION_MAX_AGE_SECONDS,
        secure,
        sameSite: "Lax",
      }),
    ],
  };
}

/**
 * Build the avatar CDN URL for a Discord user, or null.
 */
export function avatarUrl(discordUserId, avatarHash, size = 64) {
  if (!avatarHash) return null;
  const ext = String(avatarHash).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${discordUserId}/${avatarHash}.${ext}?size=${size}`;
}

export default {
  resolveAuthConfig,
  beginLogin,
  completeLogin,
  readSession,
  createSessionToken,
  clearSessionCookie,
  avatarUrl,
  COOKIE_SESSION,
  COOKIE_OAUTH_STATE,
  SESSION_MAX_AGE_SECONDS,
};