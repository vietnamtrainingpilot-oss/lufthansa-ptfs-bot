/**
 * /route — Manage flight routes (admin)
 */
import { SlashCommandBuilder } from "discord.js";
import { getDb } from "../services/firestore.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("route")
  .setDescription("Manage flight routes (admin)")
  .addSubcommand(s => s.setName("check").setDescription("Check route distance")
    .addStringOption(o => o.setName("origin").setDescription("Origin airport").setRequired(true))
    .addStringOption(o => o.setName("destination").setDescription("Destination airport").setRequired(true)))
  .addSubcommand(s => s.setName("list").setDescription("List all routes"))
  .addSubcommand(s => s.setName("set").setDescription("Set route distance")
    .addStringOption(o => o.setName("origin").setDescription("Origin").setRequired(true))
    .addStringOption(o => o.setName("destination").setDescription("Destination").setRequired(true))
    .addIntegerOption(o => o.setName("distance").setDescription("Distance in km").setRequired(true)))
  .addSubcommand(s => s.setName("remove").setDescription("Remove a route")
    .addStringOption(o => o.setName("origin").setDescription("Origin").setRequired(true))
    .addStringOption(o => o.setName("destination").setDescription("Destination").setRequired(true)));

export async function execute(interaction) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!await isStaffAuthorized(interaction.client, interaction.user.id, staffRoles)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  try {
    const db = getDb();
    if (sub === "check") {
      const origin = interaction.options.getString("origin").toUpperCase();
      const dest = interaction.options.getString("destination").toUpperCase();
      const routeKey = `${origin}-${dest}`;
      const snap = await db.collection("routes").doc(routeKey).get();
      const dist = snap.exists ? snap.data().distanceKm : null;
      return interaction.reply({ ...buildText(`Route ${routeKey}: ${dist || "Not found"} km`), ephemeral: true });
    }
    if (sub === "list") {
      const snap = await db.collection("routes").get();
      const lines = ["**Routes**", "", ...snap.docs.map(d => `• ${d.data().name || d.id}: ${d.data().distanceKm} km`)];
      return interaction.reply({ ...buildText(lines.join("\n")), ephemeral: true });
    }
    if (sub === "set") {
      const origin = interaction.options.getString("origin").toUpperCase();
      const dest = interaction.options.getString("destination").toUpperCase();
      const dist = interaction.options.getInteger("distance");
      await db.collection("routes").doc(`${origin}-${dest}`).set({
        origin, destination: dest, distanceKm: dist, routeKey: `${origin}-${dest}`, name: `${origin} - ${dest}`, lastUpdated: new Date()
      });
      return interaction.reply({ ...buildText(`Route ${origin}-${dest} set to ${dist} km.`), ephemeral: true });
    }
    if (sub === "remove") {
      const origin = interaction.options.getString("origin").toUpperCase();
      const dest = interaction.options.getString("destination").toUpperCase();
      await db.collection("routes").doc(`${origin}-${dest}`).delete();
      return interaction.reply({ ...buildText(`Route ${origin}-${dest} removed.`), ephemeral: true });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Failed: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };