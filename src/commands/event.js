/**
 * /event — Event management commands
 */
import { SlashCommandBuilder } from "discord.js";
import { createEvent, stopEvent, listEvents, getActiveEvents } from "../services/events.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText, buildMessage } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("event")
  .setDescription("Manage loyalty events (staff)")
  .addSubcommand(s => s.setName("start").setDescription("Start a new loyalty event")
    .addStringOption(o => o.setName("name").setDescription("Event name").setRequired(true))
    .addStringOption(o => o.setName("description").setDescription("Event description").setRequired(false))
    .addStringOption(o => o.setName("bonus_type").setDescription("Bonus type").setRequired(true)
      .addChoices({ name: "Multiplier", value: "multiplier" }, { name: "Flat Bonus", value: "flat" }))
    .addIntegerOption(o => o.setName("bonus_value").setDescription("Bonus multiplier (e.g. 1.25) or flat miles").setRequired(true))
    .addStringOption(o => o.setName("start_time").setDescription("ISO start time").setRequired(true))
    .addStringOption(o => o.setName("end_time").setDescription("ISO end time").setRequired(true))
    .addStringOption(o => o.setName("eligibility").setDescription("Eligibility").setRequired(false)
      .addChoices({ name: "All Members", value: "all" }, { name: "Frequent Traveller+", value: "frequent_traveler" }, { name: "Senator+", value: "senator" }, { name: "HON Circle only", value: "hon_circle" })))
  .addSubcommand(s => s.setName("stop").setDescription("Stop an active event")
    .addStringOption(o => o.setName("event_id").setDescription("Event ID").setRequired(true)))
  .addSubcommand(s => s.setName("status").setDescription("View active and scheduled events"));

export async function execute(interaction) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!await isStaffAuthorized(interaction.client, interaction.user.id, staffRoles)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === "start") {
      const id = await createEvent({
        name: interaction.options.getString("name"),
        description: interaction.options.getString("description"),
        bonusType: interaction.options.getString("bonus_type"),
        bonusValue: interaction.options.getInteger("bonus_value"),
        startTime: interaction.options.getString("start_time"),
        endTime: interaction.options.getString("end_time"),
        eligibility: interaction.options.getString("eligibility") || "all",
        createdBy: interaction.user.id,
      });
      return interaction.reply({ ...buildText(`Event created with ID: ${id}`), ephemeral: true });
    }
    if (sub === "stop") {
      await stopEvent(interaction.options.getString("event_id"), interaction.user.id);
      return interaction.reply({ ...buildText("Event stopped."), ephemeral: true });
    }
    if (sub === "status") {
      const active = await getActiveEvents();
      const all = await listEvents();
      const lines = ["**Loyalty Events**", ""];
      if (active.length > 0) {
        lines.push("**Active Events:**");
        for (const e of active) {
          lines.push(`• ${e.name} (${e.bonusType}: ${e.bonusValue}) — ends ${new Date(e.endTime).toLocaleString()}`);
        }
        lines.push("");
      }
      lines.push("**Scheduled/Past Events:**");
      for (const e of all.slice(0, 5)) {
        lines.push(`• ${e.name} — ${e.status}`);
      }
      return interaction.reply({ ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [lines.join("\n")] }), ephemeral: true });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };
