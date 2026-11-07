/**
 * /careeredit <department> <enable|disable> — Toggle department availability.
 * Staff-only. Re-renders the setup message with filtered options.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { getDb } from "../services/firestore.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";

const DEPARTMENTS = [
  "flight_deck", "cabin_crew", "ground_crew",
  "flight_operator", "human_resources", "public_relations",
];

export const data = new SlashCommandBuilder()
  .setName("careeredit")
  .setDescription("Enable or disable a career department")
  .addStringOption((o) =>
    o.setName("department").setDescription("Department slug").setRequired(true).addChoices(
      ...DEPARTMENTS.map((d) => ({ name: d, value: d }))
    ))
  .addStringOption((o) =>
    o.setName("action").setDescription("enable or disable").setRequired(true).addChoices(
      { name: "Enable", value: "enable" },
      { name: "Disable", value: "disable" }
    ))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction, client) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!(await isStaffAuthorized(client, interaction.user.id, staffRoles))) {
    return interaction.reply({ ...buildText("You do not have permission."), ephemeral: true });
  }

  const department = interaction.options.getString("department");
  const action = interaction.options.getString("action");

  const db = getDb();
  const ref = db.collection("config").doc("careerDepartments");

  // /careersetup reads config/careerDepartments.departments[] and filters on
  // `enabled`, so write that same shape. The previous { department: bool } map
  // was never read by anything, which made this command a no-op.
  const existing = (await ref.get()).data() || {};
  const list = Array.isArray(existing.departments)
    ? existing.departments.map((d) => ({ ...d }))
    : DEPARTMENTS.map((slug) => ({ value: slug, enabled: true }));

  const entry = list.find((d) => d.value === department);
  if (!entry) {
    return interaction.reply({
      ...buildText(`Department \`${department}\` is not in the careers list.`),
      ephemeral: true,
    });
  }
  entry.enabled = action === "enable";

  await ref.set({ departments: list, updatedAt: new Date().toISOString() }, { merge: true });

  const enabledCount = list.filter((d) => d.enabled !== false).length;

  return interaction.reply({
    ...buildText(
      `Department **${department}** is now ${entry.enabled ? "enabled" : "disabled"}. ` +
      `${enabledCount} of ${list.length} departments are available.\n` +
      `Re-run \`/careersetup\` in the careers channel to publish the updated menu.`
    ),
    ephemeral: true,
  });
}
