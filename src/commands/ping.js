/**
 * /ping — Basic health check. Build this first as your smoke test.
 */
import { SlashCommandBuilder } from "discord.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Ping the bot (health check)");

export async function execute(interaction) {
  const rt = Date.now() - interaction.createdTimestamp;
  await interaction.reply(buildText(`Pong! Latency: ${rt}ms (API: ${interaction.client.ws.ping}ms)`));
}
