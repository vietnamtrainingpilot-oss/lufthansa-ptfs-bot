/**
 * /flight — Staff flight management (create, log, update)
 */
import { SlashCommandBuilder } from "discord.js";
import { createFlightAndClaim } from "../services/mileageSystem.js";
import { logFlight } from "../services/flightOps.js";
import { updateFlight } from "../services/flightOps.js";
import { isStaffAuthorized, isFlightOpsAuthorized } from "../utils/permissions.js";
import { getDb } from "../services/firestore.js";
import { buildText } from "../utils/builders.js";
import config from "../config/config.js";
import { flightLabel } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("flight")
  .setDescription("Manage flights (staff)")
  .addSubcommand(s => s.setName("create").setDescription("Create flight for claims")
    .addStringOption(o => o.setName("flightnum").setDescription("Flight number").setRequired(true))
    .addStringOption(o => o.setName("departure").setDescription("Departure airport").setRequired(true))
    .addStringOption(o => o.setName("arrival").setDescription("Arrival airport").setRequired(true))
    .addStringOption(o => o.setName("distance").setDescription("Distance in km").setRequired(false))
    .addIntegerOption(o => o.setName("crewcount").setDescription("Number of crew members").setRequired(true)))
  .addSubcommand(s => s.setName("log").setDescription("Log flight complete")
    .addStringOption(o => o.setName("flightnum").setDescription("Flight number").setRequired(true)))
  .addSubcommand(s => s.setName("update").setDescription("Update flight delay/cancel")
    .addStringOption(o => o.setName("flightnum").setDescription("Flight number").setRequired(true))
    .addStringOption(o => o.setName("action").setDescription("delay or cancel").setRequired(true)
      .addChoices({ name: "Delay", value: "delay" }, { name: "Cancel", value: "cancel" }))
    .addIntegerOption(o => o.setName("delaymins").setDescription("Minutes").setRequired(false)));

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
      const distance = parseInt(interaction.options.getString("distance") || "800");
      const crewCount = interaction.options.getInteger("crewcount");
      
      const guild = await interaction.guild.fetch();
      const crewMembers = Array.from({length: crewCount}, () => interaction.user.id);
      
      const result = await createFlightAndClaim({
        flightNumber: flightNum,
        departure,
        arrival,
        crew: "crew",
        crewMembers,
        distanceKm: distance,
        routeKey: `${departure}-${arrival}`,
        client: interaction.client,
        guild
      });
      
      return interaction.reply({
        ...buildText(`Flight ${flightLabel(flightNum)} created. ${result.claims.length} claim codes generated.`),
        ephemeral: true
      });
    }
    
    if (sub === "log") {
      const flightNum = interaction.options.getString("flightnum");
      // Find flight by number and log it
      const db = getDb();
      const snap = await db.collection("flights").where("flightNumber", "==", flightNum.replace(/\s/g, "")).limit(1).get();
      if (snap.empty) return interaction.reply({ ...buildText("Flight not found."), ephemeral: true });
      await logFlight(snap.docs[0].id, interaction.client);
      return interaction.reply({ ...buildText(`Flight logged.`), ephemeral: true });
    }
    
    if (sub === "update") {
      const flightNum = interaction.options.getString("flightnum");
      const action = interaction.options.getString("action");
      const delayMins = interaction.options.getInteger("delayMins");
      
      const db = getDb();
      const snap = await db.collection("flights").where("flightNumber", "==", flightNum.replace(/\s/g, "")).limit(1).get();
      if (snap.empty) return interaction.reply({ ...buildText("Flight not found."), ephemeral: true });
      
      await updateFlight(snap.docs[0].id, {}, action, interaction.client);
      return interaction.reply({
        ...buildText(action === "cancel" ? "Flight cancelled." : `Delayed by ${delayMins} minutes.`),
        ephemeral: true
      });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Failed: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };