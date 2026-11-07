/**
 * /careersetup — Posts the department select menu in the current channel.
 * Staff-only.
 *
 * The department list is read from Firestore (config/careerDepartments) so that
 * /careeredit can actually disable a department. The static list below is only
 * a fallback for the very first run, before that document exists.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("careersetup")
  .setDescription("Post the career department selection menu")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

const DEFAULT_DEPARTMENTS = [
  { label: "Flight Deck", value: "flight_deck" },
  { label: "Cabin Crew", value: "cabin_crew" },
  { label: "Ground Crew", value: "ground_crew" },
  { label: "Flight Operator", value: "flight_operator" },
  { label: "Human Resources", value: "human_resources" },
  { label: "Public Relations", value: "public_relations" },
];

/**
 * Load the department list, honouring any department disabled via /careeredit.
 */
async function loadDepartments() {
  try {
    const { getDb } = await import("../services/firestore.js");
    const snap = await getDb().collection("config").doc("careerDepartments").get();
    if (!snap.exists) return DEFAULT_DEPARTMENTS;
    const data = snap.data() || {};
    const list = Array.isArray(data.departments) ? data.departments : DEFAULT_DEPARTMENTS;
    const enabled = list.filter((d) => d && d.enabled !== false && d.label && d.value);
    return enabled.length > 0 ? enabled : DEFAULT_DEPARTMENTS;
  } catch {
    // Firestore unavailable (e.g. very early boot): fall back to the defaults.
    return DEFAULT_DEPARTMENTS;
  }
}

export async function execute(interaction, client) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!(await isStaffAuthorized(client, interaction.user.id, staffRoles))) {
    return interaction.reply({
      ...buildText("You do not have permission to use this command."),
      ephemeral: true,
    });
  }

  const { ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, SelectMenuBuilder } = await import("discord.js");

  const departments = await loadDepartments();

  // Accent colour and the select menu both live on the CONTAINER (type 17).
  const container = new ContainerBuilder().setAccentColor(92807);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "## VietJet PTFS Careers\n> Select a department below to begin your application."
    )
  );

  const row = new ActionRowBuilder();
  row.addComponents(
    new SelectMenuBuilder()
      .setCustomId("career_department_select")
      .setPlaceholder("Choose a department to apply for")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(departments)
  );
  container.addActionRowComponents(row);

  // A setup command posts publicly; it is not a private confirmation.
  await interaction.channel.send({ flags: 32768, components: [container] });
  return interaction.reply({
    ...buildText("Careers menu posted in this channel."),
    ephemeral: true,
  });
}