/**
 * /flight — Staff flight management
 */
import { SlashCommandBuilder } from "discord.js";
import { createFlight, addPassengerManually, voidFlight } from "../services/mileageSystem.js";
import { isFlightOpsAuthorized } from "../utils/permissions.js";
import { buildText } from "../utils/builders.js";
import { flightLabel } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("flight")
  .setDescription("Manage flights (staff)")
  .addSubcommand(s => s.setName("create").setDescription("Create flight for claims")
    .addStringOption(o => o.setName("flightnum").setDescription("Flight number").setRequired(true))
    .addStringOption(o => o.setName("departure").setDescription("Departure airport").setRequired(true))
    .addStringOption(o => o.setName("arrival").setDescription("Arrival airport").setRequired(true))
    .addStringOption(o => o.setName("distance").setDescription("Distance in km").setRequired(false))
    .addIntegerOption(o => o.setName("crewcount").setDescription("Crew members").setRequired(true)))
  .addSubcommand(s => s.setName("add").setDescription("Manual passenger registration")
    .addStringOption(o => o.setName("flightid").setDescription("Flight ID").setRequired(true))
    .addUserOption(o => o.setName("user").setDescription("Passenger").setRequired(true))
    .addStringOption(o => o.setName("cabin").setDescription("Cabin").setRequired(false))
    .addStringOption(o => o.setName("notes").setDescription("Notes").setRequired(false)))
  .addSubcommand(s => s.setName("close").setDescription("Close flight claims")
    .addStringOption(o => o.setName("flightid").setDescription("Flight ID").setRequired(true)))
  .addSubcommand(s => s.setName("void").setDescription("Void a flight")
    .addStringOption(o => o.setName("flightid").setDescription("Flight ID").setRequired(true)));

export async function execute(interaction) {
  if (!await isFlightOpsAuthorized(interaction.client, interaction.user.id)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === "create") {
      const flightNum = interaction.options.getString("flightnum");
      const departure = interaction.options.getString("departure");
      const arrival = interaction.options.getString("arrival");
      const distance = interaction.options.getString("distance");
      const crewCount = interaction.options.getInteger("crewcount");
      const result = await createFlight({
        flightNumber: flightNum, departure, arrival,
        crewMembers: Array.from({length: crewCount}, () => interaction.user.id),
        distanceKm: distance ? parseInt(distance) : null,
        routeKey: `${departure}-${arrival}`,
        guild: await interaction.guild.fetch()
      });
      return interaction.reply({
        ...buildText(`Flight ${flightLabel(flightNum)} created. ${result.codes.length} claim codes generated.`),
        ephemeral: true
      });
    }
    if (sub === "add") {
      const flightId = interaction.options.getString("flightid");
      const user = interaction.options.getUser("user");
      const cabin = interaction.options.getString("cabin") || "economy";
      const notes = interaction.options.getString("notes");
      const result = await addPassengerManually({ flightId, memberId: user.id, cabin, notes });
      return interaction.reply({ ...buildText(`Added ${user.tag} to flight ${result.flightNumber}.`), ephemeral: true });
    }
    if (sub === "close") {
      const flightId = interaction.options.getString("flightid");
      const db = await import("../services/firestore.js").then(m => m.getDb());
      await db.collection("flights").doc(flightId).update({ status: "closed", closedAt: new Date() });
      return interaction.reply({ ...buildText("Flight closed."), ephemeral: true });
    }
    if (sub === "void") {
      const flightId = interaction.options.getString("flightid");
      const result = await voidFlight({ flightId, staffId: interaction.user.id });
      return interaction.reply({ ...buildText(`Flight voided. ${result.reversedTransactions} transactions reversed.`), ephemeral: true });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Failed: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };