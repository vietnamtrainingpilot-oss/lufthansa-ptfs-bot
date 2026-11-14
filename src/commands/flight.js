/**
 * /flight — Staff flight management
 */
import { SlashCommandBuilder } from "discord.js";
import { createFlight, addPassengerManually, voidFlight, getFlightInfo, listActiveFlightCodes, removePassenger, closeFlight } from "../services/mileageSystem.js";
import { isFlightOpsAuthorized } from "../utils/permissions.js";
import { buildText, buildMessage } from "../utils/builders.js";
import { flightLabel, ACCENT } from "../config/brand.js";
import config from "../config/config.js";

export const data = new SlashCommandBuilder()
  .setName("flight")
  .setDescription("Manage flights (staff)")
  .addSubcommand(s => s.setName("create").setDescription("Create flight for claims")
    .addStringOption(o => o.setName("flightnum").setDescription("Flight number").setRequired(true))
    .addStringOption(o => o.setName("departure").setDescription("Departure airport code").setRequired(true))
    .addStringOption(o => o.setName("arrival").setDescription("Arrival airport code").setRequired(true))
    .addIntegerOption(o => o.setName("distance").setDescription("Distance in km").setRequired(false))
    .addIntegerOption(o => o.setName("crewcount").setDescription("Crew members").setRequired(true)))
  .addSubcommand(s => s.setName("add").setDescription("Manual passenger registration")
    .addStringOption(o => o.setName("flightid").setDescription("Flight ID").setRequired(true))
    .addUserOption(o => o.setName("user").setDescription("Passenger").setRequired(true))
    .addStringOption(o => o.setName("cabin").setDescription("Cabin class").setRequired(false)
      .addChoices({ name: "Economy", value: "economy" }, { name: "Premium Economy", value: "premium_economy" }, { name: "Business", value: "business" }, { name: "First", value: "first" }))
    .addStringOption(o => o.setName("notes").setDescription("Notes").setRequired(false)))
  .addSubcommand(s => s.setName("remove").setDescription("Remove a passenger and reverse earnings")
    .addStringOption(o => o.setName("flightid").setDescription("Flight ID").setRequired(true))
    .addUserOption(o => o.setName("member").setDescription("Member to remove").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for removal").setRequired(true)))
  .addSubcommand(s => s.setName("close").setDescription("Close flight claims")
    .addStringOption(o => o.setName("flightid").setDescription("Flight ID").setRequired(true)))
  .addSubcommand(s => s.setName("void").setDescription("Void a flight entirely")
    .addStringOption(o => o.setName("flightid").setDescription("Flight ID").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)))
  .addSubcommand(s => s.setName("codes").setDescription("Show active claim codes")
    .addBooleanOption(o => o.setName("include_expired").setDescription("Include expired codes").setRequired(false)))
  .addSubcommand(s => s.setName("info").setDescription("View flight details")
    .addStringOption(o => o.setName("flightid").setDescription("Flight ID").setRequired(true)));

export async function execute(interaction) {
  if (!await isFlightOpsAuthorized(interaction.client, interaction.user.id)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === "create") {
      const flightNum = interaction.options.getString("flightnum");
      const departure = interaction.options.getString("departure").toUpperCase();
      const arrival = interaction.options.getString("arrival").toUpperCase();
      const distance = interaction.options.getInteger("distance");
      const crewCount = interaction.options.getInteger("crewcount");
      const result = await createFlight({
        flightNumber: flightNum, departure, arrival,
        crewMembers: Array.from({length: crewCount}, () => `crew_${Date.now()}_${Math.random().toString(36).slice(2)}`),
        distanceKm: distance || null,
        routeKey: `${departure}-${arrival}`,
        guild: interaction.guildId,
      });
      const lines = [
        `**Flight ${flightLabel(flightNum)} Created**`,
        "",
        `Route: ${departure} -> ${arrival}${result.distance ? ` (${result.distance} km)` : ""}`,
        `Claim Codes (${result.codes.length}): ${result.codes.join(", ")}`,
      ];
      return interaction.reply({
        ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [lines.join("\n")] }),
        ephemeral: true
      });
    }
    if (sub === "add") {
      const flightId = interaction.options.getString("flightid");
      const user = interaction.options.getUser("user");
      const cabin = interaction.options.getString("cabin") || "economy";
      const notes = interaction.options.getString("notes");
      const result = await addPassengerManually({ flightId, memberId: user.id, cabin, notes });
      return interaction.reply({
        ...buildText(`Added ${user.tag} to flight ${result.flightNumber}. Earned ${result.awardMiles} Award Miles.`),
        ephemeral: true
      });
    }
    if (sub === "remove") {
      const flightId = interaction.options.getString("flightid");
      const member = interaction.options.getUser("member");
      const reason = interaction.options.getString("reason");
      try {
        const result = await import("../services/mileageSystem.js").then(m => m.removePassenger({ flightId, memberId: member.id, reason }));
        return interaction.reply({
          ...buildText(`${member.tag} removed from flight. Reversed ${result.reversedMiles} Award Miles.`),
          ephemeral: true
        });
      } catch (e) {
        return interaction.reply({ ...buildText(e.message), ephemeral: true });
      }
    }
    if (sub === "close") {
      const flightId = interaction.options.getString("flightid");
      await closeFlight(flightId);
      return interaction.reply({ ...buildText("Flight claims closed."), ephemeral: true });
    }
    if (sub === "void") {
      const flightId = interaction.options.getString("flightid");
      const reason = interaction.options.getString("reason") || "Staff decision";
      const result = await voidFlight({ flightId, staffId: interaction.user.id, reason });
      return interaction.reply({ ...buildText(`Flight voided. ${result.reversedTransactions} transactions reversed.`), ephemeral: true });
    }
    if (sub === "codes") {
      const includeExpired = interaction.options.getBoolean("include_expired") || false;
      const codes = await listActiveFlightCodes(includeExpired);
      if (codes.length === 0) return interaction.reply({ ...buildText("No active flights with claim codes."), ephemeral: true });
      const codeLines = codes.slice(0, 10).map(c => `• ${c.flightNumber}: ${c.code} (expires ${new Date(c.expiresAt).toLocaleString()})`);
      const lines = ["**Active Flight Claim Codes**", "", ...codeLines];
      return interaction.reply({ ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [lines.join("\n")] }), ephemeral: true });
    }
    if (sub === "info") {
      const flightId = interaction.options.getString("flightid");
      const info = await getFlightInfo(flightId);
      if (!info) return interaction.reply({ ...buildText("Flight not found."), ephemeral: true });
      const lines = [
        "**Flight Information**",
        "",
        `**Flight:** ${info.flightNumber}`,
        `**Route:** ${info.departureAirport} -> ${info.arrivalAirport}`,
        `**Distance:** ${info.distanceKm?.toLocaleString() || "N/A"} km`,
        `**Status:** ${info.status}`,
        `**Passengers:** ${info.passengerCount || 0}`,
      ];
      return interaction.reply({ ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [lines.join("\n")] }), ephemeral: true });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Failed: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };