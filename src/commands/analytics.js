/**
 * /analytics — Community statistics dashboard (AeroNexus 20).
 */
import { SlashCommandBuilder } from "discord.js";
import { getCommunityAnalytics } from "../services/analytics.js";
import { buildText, buildMessage } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("analytics")
  .setDescription("View community statistics");

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const stats = await getCommunityAnalytics();

  const lines = [
    `**Community Analytics** — ${new Date(stats.timestamp).toLocaleDateString()}`,
    "",
    `Flights: ${stats.flights.total} total, ${stats.flights.completed} completed (${stats.flights.completionRate}%)`,
    `Members: ${stats.members.total} total, ${stats.members.totalQualifyingFlights} flights flown`,
    `Economy: ${stats.members.totalMilesEarned.toLocaleString()} Miles earned, ${stats.members.totalCreditsInCirculation.toLocaleString()} Credits circulating`,
    `Support: ${stats.support.open} open, ${stats.support.closed} closed`,
    `Careers: ${stats.careers.submitted} applications, ${stats.careers.acceptanceRatePercent}% acceptance`,
  ];

  return interaction.editReply({
    ...buildMessage({ accentColor: ACCENT.INFO, text: [lines.join("\n")] }),
    ephemeral: true,
  });
}

export default { data, execute };