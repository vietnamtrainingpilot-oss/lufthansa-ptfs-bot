# Website sign-in setup (Discord OAuth2)

The member dashboard signs members in with Discord. This document covers what
an operator has to configure. Until every value below is present, the site runs
normally and `/auth/login` shows a clear "not configured" page — sign-in is
never faked or stubbed.

Lufthansa PTFS is an unofficial community project and is not affiliated with
lufthansa Air.

## 1. Create the OAuth2 application

In the Discord Developer Portal, open your application's **OAuth2** section and
add a redirect:

```
https://<your-public-host>/auth/callback
```

`<your-public-host>` must match `WEBSITE_BASE_URL` exactly, including scheme,
no trailing slash, and any path prefix. Discord compares the redirect URI
literally, so `http` versus `https` and a trailing slash both matter.

The bot needs only the `identify` scope. No email, no guilds, no `bot` scope.

Copy the **Client Secret** into your `.env` as `DISCORD_OAUTH_CLIENT_SECRET`.
The client ID is the same value as `DISCORD_CLIENT_ID`, which the bot already
uses.

## 2. Environment variables

Add these to `.env` (see `.env.example`):

```ini
# Public origin the browser reaches. Used to derive the OAuth redirect.
WEBSITE_BASE_URL=https://your-public-host

# Signs the session cookie. Generate a long random value.
WEBSITE_SESSION_SECRET=

# OAuth2 client secret from the Developer Portal.
DISCORD_OAUTH_CLIENT_SECRET=
```

`SESSION_SECRET`, `PUBLIC_BASE_URL` and `DISCORD_CLIENT_SECRET` are accepted as
aliases, but prefer the names above so `.env` matches `.env.example`.

To generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Never reuse the bot token or the Firebase private key as the session secret.
Rotating `WEBSITE_SESSION_SECRET` invalidates every existing session, which is
the intended way to force a mass sign-out.

## 3. Expose the server

The Express server binds to loopback only, so it is never directly reachable
from the internet. Put a TLS-terminating reverse proxy or a tunnel in front of
it:

- Caddy, nginx, Apache, or a platform router (Render, Railway, Fly, VPS)
- Cloudflare Tunnel or ngrok for a temporary host

Whatever you use must forward to the port in `BOOKING_API_PORT` (default `3001`)
and pass through the `x-forwarded-proto` header, because the secure-cookie flag
and the HSTS header are decided from it. Sign-in will not complete over plain
`http` to a public host.

`PUBLIC_BASE_URL` is not read from the request. The redirect is always the one
configured above, which prevents an attacker-supplied `Host` header from
steering the OAuth callback.

## 4. Verify

```bash
# Configured?
curl -s https://your-public-host/api/session | jq .

# Not configured (missing values)?
curl -s https://your-public-host/api/session | jq .
```

Then, signed out in a private window:

1. Open `https://your-public-host/dashboard.html`
2. Choose sign in and complete the Discord consent screen
3. Confirm the dashboard shows your own balance and flight history

If the callback lands on an error page, the redirect URI in the Developer Portal
and `WEBSITE_BASE_URL` disagree.

## Security notes

- The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS. The
  browser never receives the client secret, the bot token, or a Firestore key.
- Member identity comes from the signed session cookie, never from a
  client-supplied user id, so one member cannot read or spend another's balance
  by editing a request.
- Sign-in requests carry a signed state value with a PKCE verifier, and the
  callback compares them in constant time. A callback without the matching
  cookie is rejected.
- Sessions are stateless and expire after 12 hours. There is no server-side
  revocation list, so a stolen cookie stays valid until it expires; rotate
  `WEBSITE_SESSION_SECRET` to invalidate outstanding sessions immediately.
