/**
 * /tiers — Advanced membership tier management (admin)
 */
import { SlashCommandBuilder } from "discord.js";
import { getDb } from "../services/firestore.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { TIERS } from "../services/members.js";
import { syncTier, getTierProgress } from "../services/tiers.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("tiers")
  .setDescription("Manage membership tiers (admin)")
  .addSubcommand(s => s.setName("view").setDescription("View current tier configuration"))
  .addSubcommand(s => s.setName("add").setDescription("Add a custom tier")
    .addStringOption(o => o.setName("name").setDescription("Tier name").setRequired(true))
    .addIntegerOption(o => o.setName("status_points").setDescription("Status points threshold").setRequired(true))
    .addIntegerOption(o => o.setName("qualifying_points").setDescription("Qualifying points threshold").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Discord role to assign").setRequired(false))
    .addStringOption(o => o.setName("benefits").setDescription("Benefits description").setRequired(false)))
  .addSubcommand(s => s.setName("remove").setDescription("Archive a tier")
    .addStringOption(o => o.setName("tier").setDescription("Tier key").setRequired(true)))
  .addSubcommand(s => s.setName("rename").setDescription("Rename a tier")
    .addStringOption(o => o.setName("current_name").setDescription("Current tier key").setRequired(true))
    .addStringOption(o => o.setName("new_name").setDescription("New display name").setRequired(true)))
  .addSubcommand(s => s.setName("role").setDescription("Map a tier to a Discord role")
    .addStringOption(o => o.setName("tier").setDescription("Tier key").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Discord role").setRequired(true)))
  .addSubcommand(s => s.setName("threshold").setDescription("Configure qualification thresholds")
    .addStringOption(o => o.setName("tier").setDescription("Tier").setRequired(true)
      .addChoices(
        { name: "Frequent Traveller", value: "frequent_traveler" },
        { name: "Senator", value: "senator" },
        { name: "HON Circle", value: "hon_circle" }
      ))
    .addIntegerOption(o => o.setName("status_points").setDescription("Status points threshold").setRequired(false))
    .addIntegerOption(o => o.setName("qualifying_points").setDescription("Qualifying points threshold").setRequired(false))
    .addIntegerOption(o => o.setName("hon_points").setDescription("HON Circle points threshold").setRequired(false)))
  .addSubcommand(s => s.setName("sync").setDescription("Sync all member roles to current tiers"));

export async function execute(interaction) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!await isStaffAuthorized(interaction.client, interaction.user.id, staffRoles)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  const db = getDb();
  try {
    if (sub === "view") {
      const lines = ["**Membership Tiers**", "", ...Object.entries(TIERS).map(([t, c]) =>
        `* ${c.label}: ${c.statusPoints} status pts / ${c.qualifyingPoints} qualifying pts`
      ), "", "**Note:** Frequent Traveller requires both 650 Status Points AND 325 Qualifying Points."];
      return interaction.reply({ ...buildText(lines.join("\n")), ephemeral: true });
    }
    if (sub === "add") {
      const tierKey = interaction.options.getString("name").toLowerCase().replace(/\s/g, "_");
      await db.collection("config").doc("mileageTiers").update({
        [tierKey]: {
          statusPoints: interaction.options.getInteger("status_points"),
          qualifyingPoints: interaction.options.getInteger("qualifying_points"),
          label: interaction.options.getString("name"),
          benefits: interaction.options.getString("benefits") || "",
          discordRoleId: interaction.options.getRole("role")?.id || null,
        }
      });
      return interaction.reply({ ...buildText(`Tier "${interaction.options.getString("name")}" added.`), ephemeral: true });
    }
    if (sub === "remove") {
      const tierKey = interaction.options.getString("tier");
      // Check if any members have this tier
      const membersSnap = await db.collection("members").where("membership.tier", "==", tierKey).limit(1).get();
      if (!membersSnap.empty) return interaction.reply({ ...buildText(`Cannot remove: ${membersSnap.size} member(s) still have this tier. Reassign them first.`), ephemeral: true });
      await db.collection("config").doc("mileageTiers").update({ [tierKey]: admin.firestore.FieldValue.delete() });
      return interaction.reply({ ...buildText(`Tier "${tierKey}" archived.`), ephemeral: true });
    }
    if (sub === "rename") {
      const currentKey = interaction.options.getString("current_name");
      const newName = interaction.options.getString("new_name");
      await db.collection("config").doc("mileageTiers").update({
        [`old_${currentKey}`]: { label: newName, archivedAt: new Date() },
        [currentKey]: { ...(TIERS[newName] || {}), label: newName },
      });
      return interaction.reply({ ...buildText(`Tier renamed to "${newName}". Historical records preserved.`), ephemeral: true });
    }
    if (sub === "role") {
      const tierKey = interaction.options.getString("tier");
      const roleId = interaction.options.getRole("role").id;
      await db.collection("config").doc("tierRoles").set({
        [tierKey]: roleId,
        updatedAt: new Date(),
      }, { merge: true });
      return interaction.reply({ ...buildText(`Role mapped: ${tierKey} → <@&${roleId}>`), ephemeral: true });
    }
    if (sub === "threshold") {
      const tierKey = interaction.options.getString("tier");
      const updateData = {};
      const sp = interaction.options.getInteger("status_points");
      const qp = interaction.options.getInteger("qualifying_points");
      const hp = interaction.options.getInteger("hon_points");
      if (sp !== null) updateData[`mileageTiers.${tierKey}.statusPoints`] = sp;
      if (qp !== null) updateData[`mileageTiers.${tierKey}.qualifyingPoints`] = qp;
      if (hp !== null) updateData[`mileageTiers.${tierKey}.honPoints`] = hp;
      await db.collection("config").update(updateData);
      return interaction.reply({ ...buildText(`Thresholds updated for ${tierKey}.`), ephemeral: true });
    }
    if (sub === "sync") {
      let synced = 0;
      const membersSnap = await db.collection("members").get();
      for (const doc of membersSnap.docs) {
        try {
          const updated = await syncTier(doc.id, interaction.client);
          if (updated) synced++;
        } catch {}
      }
      return interaction.reply({ ...buildText(`Role sync complete: ${synced} members updated.`), ephemeral: true });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };
