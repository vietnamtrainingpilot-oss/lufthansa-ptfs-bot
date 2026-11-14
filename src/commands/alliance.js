/**
 * /alliance — Alliance management commands
 */
import { SlashCommandBuilder } from "discord.js";
import {
  createAlliance, listAlliances, getMemberAlliance,
  joinAlliance, leaveAlliance, kickMember, setPartnerRate, regenerateInviteCode,
} from "../services/alliances.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText, buildMessage } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("alliance")
  .setDescription("Manage airline alliances")
  .addSubcommand(s => s.setName("create").setDescription("Create a new alliance")
    .addStringOption(o => o.setName("name").setDescription("Alliance name").setRequired(true))
    .addStringOption(o => o.setName("description").setDescription("Description").setRequired(false)))
  .addSubcommand(s => s.setName("join").setDescription("Join an alliance")
    .addStringOption(o => o.setName("code").setDescription("Invitation code").setRequired(true)))
  .addSubcommand(s => s.setName("leave").setDescription("Leave your current alliance"))
  .addSubcommand(s => s.setName("info").setDescription("View alliance information"))
  .addSubcommand(s => s.setName("list").setDescription("List all alliances"))
  .addSubcommand(s => s.setName("kick").setDescription("Kick a member airline")
    .addStringOption(o => o.setName("alliance_id").setDescription("Alliance ID").setRequired(true))
    .addStringOption(o => o.setName("guild_id").setDescription("Server guild ID to kick").setRequired(true)))
  .addSubcommand(s => s.setName("rate").setDescription("Set partner mileage rate")
    .addStringOption(o => o.setName("alliance_id").setDescription("Alliance ID").setRequired(true))
    .addIntegerOption(o => o.setName("rate").setDescription("Rate percentage (50-150)").setRequired(true)))
  .addSubcommand(s => s.setName("code").setDescription("Regenerate invitation code")
    .addStringOption(o => o.setName("alliance_id").setDescription("Alliance ID").setRequired(true)));

export async function execute(interaction) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  const isStaff = await isStaffAuthorized(interaction.client, interaction.user.id, staffRoles);
  const sub = interaction.options.getSubcommand();

  // Join and leave are available to any member; rest require staff
  const readOnly = ["info", "list", "join", "leave"];
  if (!isStaff && !readOnly.includes(sub)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }

  try {
    if (sub === "create") {
      const result = await createAlliance({
        name: interaction.options.getString("name"),
        description: interaction.options.getString("description"),
        createdBy: interaction.user.id,
      });
      return interaction.reply({
        ...buildMessage({
          accentColor: ACCENT.BRAND_NAVY,
          text: [`Alliance created!\n\n**Name:** ${result.name}\n**Invite Code:** ${result.code}\n\nShare this code with other airlines to grow your alliance.`],
        }),
        ephemeral: true,
      });
    }
    if (sub === "join") {
      const code = interaction.options.getString("code").toUpperCase();
      await joinAlliance({ allianceId: null, code, serverId: interaction.guildId });
      // Note: this requires finding alliance by code — simplified for now
      return interaction.reply({ ...buildText("Alliance join request submitted."), ephemeral: true });
    }
    if (sub === "leave") {
      await leaveAlliance(interaction.guildId);
      return interaction.reply({ ...buildText("You have left the alliance."), ephemeral: true });
    }
    if (sub === "info") {
      const membership = await getMemberAlliance(interaction.guildId);
      if (!membership) return interaction.reply({ ...buildText("This server is not part of any alliance."), ephemeral: true });
      const lines = [
        "**Alliance Information**", "",
        `**Name:** ${membership.name}`,
        `**Description:** ${membership.description || "None"}`,
        `**Partner Rate:** ${membership.partnerRate}%`,
        `**Your Role:** ${membership.memberRole || "member"}`,
      ];
      return interaction.reply({ ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [lines.join("\n")] }), ephemeral: true });
    }
    if (sub === "list") {
      const alliances = await listAlliances();
      const lines = ["**Active Alliances**", "", ...(alliances.length === 0 ? ["No alliances yet."] :
        alliances.map(a => `• ${a.name} — ${a.partnerRate}% partner rate`))];
      return interaction.reply({ ...buildMessage({ accentColor: ACCENT.DEFAULT, text: [lines.join("\n")] }), ephemeral: true });
    }
    if (sub === "kick") {
      await kickMember(
        interaction.options.getString("alliance_id"),
        interaction.options.getString("guild_id"),
        interaction.user.id
      );
      return interaction.reply({ ...buildText("Member kicked from alliance."), ephemeral: true });
    }
    if (sub === "rate") {
      const rate = await setPartnerRate(
        interaction.options.getString("alliance_id"),
        interaction.options.getInteger("rate"),
        interaction.user.id
      );
      return interaction.reply({ ...buildText(`Partner rate updated to ${rate}%.`), ephemeral: true });
    }
    if (sub === "code") {
      const newCode = await regenerateInviteCode(
        interaction.options.getString("alliance_id"),
        interaction.user.id
      );
      return interaction.reply({
        ...buildText(`New invite code: **${newCode}**\nPrevious code has been invalidated.`),
        ephemeral: true
      });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };
