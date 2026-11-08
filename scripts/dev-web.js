/**
 * dev-web.js — Local development runner for the website and API only.
 *
 * Boots the Express app from src/web/server.js without the Discord bot,
 * so the site can be previewed locally without a full .env. OAuth and
 * Firestore-backed endpoints degrade gracefully (they report "not configured"
 * or 503) exactly as they would on a server with missing configuration.
 *
 * Usage: node scripts/dev-web.js   (PORT overrides the default 3001)
 */

import config from "../src/config/config.js";
import { createWebApp } from "../src/web/server.js";

const port = Number(process.env.PORT || process.env.BOOKING_API_PORT || 3001);
const app = createWebApp({ config, discordClient: null });

app.listen(port, "0.0.0.0", () => {
  console.log(`[dev-web] Site and API listening on http://localhost:${port}`);
});
