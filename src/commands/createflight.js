/**
 * /createflight — Requires flight ops authorization.
 * Inputs: flight number, scheduled time, aircraft, departure, arrival,
 *         private server link, classes, spawn location, gate, flight duration, host.
 */
import { SlashCommandBuilder } from "discord.js";
import { isFlightOpsAuthorized } from "../utils/permissions.js";
import { createFlight } from "../services/flightOps.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("createflight")
  .setDescription("Create a new flight (staff only)")
  .addStringOption((o) => o.setName("flightnumber").setDescription("Flight number (e.g. VJ101)").setRequired(true))
  .addIntegerOption((o) => o.setName("scheduled").setDescription("Unix timestamp for scheduled departure").setRequired(true))
  .addStringOption((o) => o.setName("departure").setDescription("Departure airport code").setRequired(true))
  .addStringOption((o) => o.setName("arrival").setDescription("Arrival airport code").setRequired(true))
  .addStringOption((o) => o.setName("aircraft").setDescription("Aircraft type").setRequired(true))
  .addStringOption((o) => o.setName("classes").setDescription("Classes offered").setRequired(true))
  .addStringOption((o) => o.setName("privateserver").setDescription("Private server link").setRequired(false))
  .addStringOption((o) => o.setName("spawn").setDescription("PTFS spawn location").setRequired(true))
  .addStringOption((o) => o.setName("gate").setDescription("Gate number").setRequired(true))
  .addIntegerOption((o) => o.setName("duration").setDescription("Flight time in minutes").setRequired(true))
  .addUserOption((o) => o.setName("host").setDescription("Flight host (defaults to invoker)").setRequired(false));

export async function execute(interaction, client) {
  if (!(await isFlightOpsAuthorized(client, interaction.user.id))) {
    return interaction.reply({ ...buildText("You do not have permission to use this command."), ephemeral: true });
  }

  await interaction.deferReply({ flags: 32768, ephemeral: true });

  try {
    const flightNumber = interaction.options.getString("flightnumber");
    const scheduledUnixTime = interaction.options.getInteger("scheduled");
    const hostId = interaction.options.getUser("host")?.id || interaction.user.id;

    const flight = await createFlight({
      flightNumber,
      hostId,
      scheduledUnixTime,
      departureAirport: interaction.options.getString("departure"),
      arrivalAirport: interaction.options.getString("arrival"),
      aircraft: interaction.options.getString("aircraft"),
      classes: interaction.options.getString("classes"),
      privateServerLink: interaction.options.getString("privateserver") || "",
      spawnLocation: interaction.options.getString("spawn"),
      gateNumber: interaction.options.getString("gate"),
      flightTimeMinutes: interaction.options.getInteger("duration"),
      client,
      guild: interaction.guild,
    });

    await interaction.editReply(buildText(`Done! Flight VJ${flight.flightNumber} created (ID: ${flight.id}). Preview posted.`));
  } catch (e) {
    console.error("[createflight] Error:", e.message);
    await interaction.editReply(buildText(`Failed to create flight: ${e.message}`));
  }
}
