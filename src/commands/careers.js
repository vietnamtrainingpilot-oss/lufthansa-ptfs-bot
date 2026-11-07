/**
 * /careers — Alias for /careersetup (posts the setup menu).
 */
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { data as careerSetupData, execute as careerSetupExecute } from "./careersetup.js";

export const data = new SlashCommandBuilder()
  .setName("careers")
  .setDescription("Post the careers department selection menu");

export async function execute(interaction, client) {
  await careerSetupExecute(interaction, client);
}
