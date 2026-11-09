/**
 * index.js — Lufthansa PTFS Discord Bot entry point.
 * Boots the bot, registers commands, starts the timer poller and API server.
 */

import { Client, GatewayIntentBits, Collection } from "discord.js";
import { initFirestore } from "./services/firestore.js";
import { startTimerPoller, registerHandler } from "./timers/timers.js";
import { assertConfigComplete } from "./config/config.js";
import config from "./config/config.js";
import { handleInteraction } from "./interactions/interactions.js";
import { handleCareerQuestionReply } from "./interactions/careers.js";
import { handleCheckIn } from "./services/flightOps.js";
import { createLogger } from "./utils/logger.js";
import { buildText } from "./utils/builders.js";

const logger = createLogger("bot");

// Fail fast and loudly if the environment is incomplete. Crashes with a clear
// list of missing variables rather than degrading silently at runtime.
assertConfigComplete();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ─── Register commands ──────────────────────────────────────────────────────

const commands = [];
const clientCommands = new Collection();

// A failure here means zero commands register and every slash command silently
// does nothing, so it is deliberately NOT swallowed. Fail loudly at boot.
const commandFiles = await import("./commands/index.js");

for (const [name, cmd] of Object.entries(commandFiles.default)) {
  if (cmd.data && typeof cmd.execute === "function") {
    commands.push(cmd.data.toJSON());
    clientCommands.set(name, cmd);
  }
}

client.commands = clientCommands;

if (commands.length === 0) {
  logger.error("No slash commands were found. Check src/commands/ for command modules.");
} else {
  logger.info(`Loaded ${commands.length} slash command(s).`);
}

// ─── Ready ──────────────────────────────────────────────────────────────────

client.once("ready", async () => {
  logger.info(`Logged in as ${client.user.tag}`);

  // Init Firestore
  initFirestore();

  // Seed default achievements catalog (System 11.5).
  try {
    const { seedAchievements } = await import("./services/achievements.js");
    await seedAchievements();
  } catch (e) {
    logger.error("Achievement seed failed:", e.message);
  }

  // Start timer poller (catches up on missed timers)
  startTimerPoller();

  // Register timer handlers
  registerHandler("careerQuestionExpiry", async (timer) => {
    const { appId, userId } = timer.payload;
    const db = await import("./services/firestore.js").then((m) => m.getDb());
    const appRef = db.collection("careerApplications").doc(appId);
    await appRef.update({ status: "denied", reason: "Did not respond within 10 minutes" });
    try {
      const user = await client.users.fetch(userId);
      await user.send({ ...buildText("Your application was denied: you did not respond to a question within 10 minutes.") });
    } catch (e) { /* DM may have failed */ }
  });

  registerHandler("ticketJoinLinkDelete", async (timer) => {
    // Join link auto-deletion is handled by checking message age; no action needed here for MVP.
  });

  registerHandler("flightCheckin", async (timer) => {
    await handleCheckIn(timer, client);
  });

  // Sync slash commands to Discord
  try {
    const { REST, Routes } = await import("discord.js");
    const rest = new REST({ version: "10" }).setToken(config.token);
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    logger.info("Slash commands registered");
  } catch (e) {
    logger.error("Failed to register commands:", e.message);
  }

  // Start the web server (static site + auth + API)
  await startWebServer();
});

// ─── Interaction handler ────────────────────────────────────────────────────

client.on("interactionCreate", (interaction) => {
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    cmd.execute(interaction, client).catch(console.error);
  } else if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
    handleInteraction(interaction, client).catch(console.error);
  }
});

// ─── DM handler for career questions ───────────────────────────────────────

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild && message.channel.type === 1) {
    // Direct message
    await handleCareerQuestionReply(client, message);
  }
});

// ─── Error handler ─────────────────────────────────────────────────────────

client.on("error", (err) => {
  logger.error("Client error:", err.message);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection:", reason);
});

// ─── Web server (static site + auth + API) ───────────────────────────────

/**
 * Start the Express app that serves the public website, the Discord OAuth2
 * sign-in routes, and the JSON API.
 *
 * Binds to 0.0.0.0 so it works behind a reverse proxy / platform router.
 * The platform (Wispbyte / Pterodactyl) provides the public HTTPS endpoint.
 * Port is read from the environment (BOOKING_API_PORT / PORT).
 */
async function startWebServer() {
  const { createWebApp } = await import("./web/server.js");
  const app = createWebApp({ config, discordClient: client });
  const port = Number(process.env.PORT || process.env.BOOKING_API_PORT || 3001);
  app.listen(port, "0.0.0.0", () => {
    logger.info(`Web server and API listening on 0.0.0.0:${port}`);
  });
}

// ─── Graceful shutdown ──────────────────────────────────────────────────────

process.on("SIGINT", async () => {
  logger.info("Shutting down...");
  const { stopTimerPoller } = await import("./timers/timers.js");
  stopTimerPoller();
  client.destroy();
  process.exit(0);
});

// ─── Login ─────────────────────────────────────────────────────────────────

client.login(config.token).catch((err) => {
  logger.error("Login failed:", err.message);
  process.exit(1);
});

export default client;
