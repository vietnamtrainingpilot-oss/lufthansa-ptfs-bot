/**
 * logger.js — structured console logger with optional Discord error-channel sink.
 * Never logs bot tokens, Firebase private keys, webhook secrets, or other credentials.
 */

const SENSITIVE_KEYS = [
  "token",
  "privateKey",
  "clientEmail",
  "webhookSecret",
  "sessionSecret",
  "oauthClientSecret",
  "DISCORD_BOT_TOKEN",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_CLIENT_EMAIL",
  "BOOKING_WEBHOOK_SECRET",
  "WEBSITE_SESSION_SECRET",
  "DISCORD_OAUTH_CLIENT_SECRET",
];

function sanitize(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s.toLowerCase()))) {
      out[k] = "***REDACTED***";
    } else if (v && typeof v === "object") {
      out[k] = sanitize(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function timestamp() {
  return new Date().toISOString();
}

export function createLogger(context) {
  const prefix = context ? `[${context}]` : "";
  return {
    info(msg, data) {
      console.log(`${timestamp()} ${prefix} INFO  ${msg}`, data ? sanitize(data) : "");
    },
    warn(msg, data) {
      console.warn(`${timestamp()} ${prefix} WARN  ${msg}`, data ? sanitize(data) : "");
    },
    error(msg, data) {
      console.error(`${timestamp()} ${prefix} ERROR ${msg}`, data ? sanitize(data) : "");
    },
    debug(msg, data) {
      if (process.env.NODE_ENV !== "production") {
        console.debug(`${timestamp()} ${prefix} DEBUG ${msg}`, data ? sanitize(data) : "");
      }
    },
  };
}

export const logger = createLogger("bot");

/**
 * Post an error message to the configured ERROR_LOG_CHANNEL_ID.
 * Safe to call before the channel is resolvable; failures are swallowed.
 */
export async function logErrorToDiscord(client, title, body) {
  try {
    const config = (await import("../config/config.js")).default;
    const channel = await client.channels.fetch(config.errorLogChannelId);
    if (!channel || !channel.isTextBased()) return;
    await channel.send({
      content: `## [${timestamp()}] ${title}`,
      components: [
        {
          type: 17,
          accent_color: 15158332,
          components: [
            { type: 10, content: String(body).slice(0, 1900) },
          ],
        },
      ],
    });
  } catch (e) {
    // Swallow — we must not crash the bot because error logging failed.
    console.error("[logger] Failed to post error to Discord:", e.message);
  }
}

export default { createLogger, logger, logErrorToDiscord };