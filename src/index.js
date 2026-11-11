/**
 * index.js — Lufthansa PTFS Discord Bot entry point.
 */
import { Client, GatewayIntentBits, Collection } from "discord.js";
import { initFirestore } from "./services/firestore.js";
import { startTimerPoller, registerHandler } from "./timers/timers.js";
import { assertConfigComplete } from "./config/config.js";
import config from "./config/config.js";
import { handleInteraction } from "./interactions/interactions.js";
import { handleCheckIn } from "./services/flightOps.js";
import { createLogger } from "./utils/logger.js";
import { buildText } from "./utils/builders.js";

const logger = createLogger("bot");
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

const commands = [];
const clientCommands = new Collection();
const commandFiles = await import("./commands/index.js");

for (const [name, cmd] of Object.entries(commandFiles.default)) {
  if (cmd.data && typeof cmd.execute === "function") {
    commands.push(cmd.data.toJSON());
    clientCommands.set(name, cmd);
  }
}

client.commands = clientCommands;
if (commands.length === 0) {
  logger.error("No slash commands were found.");
} else {
  logger.info(`Loaded ${commands.length} slash command(s).`);
}

client.once("ready", async () => {
  logger.info(`Logged in as ${client.user.tag}`);
  initFirestore();

  // Initialize Mileage & More system
  try {
    const { seedMileageSystem } = await import("./services/mileageSystem.js");
    await seedMileageSystem(logger);
    logger.info("[mileage] Mileage & More system initialized");
  } catch (e) {
    logger.error("Mileage initialization failed:", e.message);
  }

  // Seed achievements
  try {
    const { seedAchievements } = await import("./services/achievements.js");
    await seedAchievements();
    logger.info("[mileage] Achievements seeded");
  } catch (e) {
    logger.error("Achievement seed failed:", e.message);
  }

  startTimerPoller();
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
    // Join link auto-deletion is handled by checking message age
  });

  registerHandler("flightCheckin", async (timer) => {
    await handleCheckIn(timer, client);
  });

  try {
    const { REST, Routes } = await import("discord.js");
    const rest = new REST({ version: "10" }).setToken(config.token);
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    logger.info("Slash commands registered");
  } catch (e) {
    logger.error("Failed to register commands:", e.message);
  }
});

client.on("interactionCreate", (interaction) => {
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    cmd.execute(interaction, client).catch(console.error);
  } else if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
    handleInteraction(interaction, client).catch(console.error);
  }
});

client.on("error", (err) => {
  logger.error("Client error:", err.message);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection:", reason);
});

process.on("SIGINT", async () => {
  logger.info("Shutting down...");
  const { stopTimerPoller } = await import("./timers/timers.js");
  stopTimerPoller();
  client.destroy();
  process.exit(0);
});

client.login(config.token).catch((err) => {
  logger.error("Login failed:", err.message);
  process.exit(1);
});

export default client;