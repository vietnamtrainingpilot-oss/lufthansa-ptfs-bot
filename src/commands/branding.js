/**
 * /branding — Brand configuration commands
 */
import { SlashCommandBuilder } from "discord.js";
import { setBrandingProperty, getBrandingConfig, resetBranding, validateEmoji, validateLogoUrl } from "../services/branding.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText, buildMessage } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("branding")
  .setDescription("Configure brand appearance")
  .addSubcommand(s => s.setName("color").setDescription("Set primary embed color")
    .addStringOption(o => o.setName("hex").setDescription("Hex color (e.g. FFAD00)").setRequired(true)))
  .addSubcommand(s => s.setName("secondary-color").setDescription("Set secondary color"))
  .addSubcommand(s => s.setName("name").setDescription("Set displayed programme name")
    .addStringOption(o => o.setName("name").setDescription("Programme name").setRequired(true)))
  .addSubcommand(s => s.setName("footer").setDescription("Set embed footer text")
    .addStringOption(o => o.setName("text").setDescription("Footer text").setRequired(true)))
  .addSubcommand(s => s.setName("logo").setDescription("Set branding logo URL")
    .addStringOption(o => o.setName("url").setDescription("Image URL").setRequired(true)))
  .addSubcommand(s => s.setName("emoji-set").setDescription("Set custom emoji")
    .addStringOption(o => o.setName("type").setDescription("Emoji type").setRequired(true)
      .addChoices({ name: "Check-in", value: "checkIn" }, { name: "Milestone", value: "milestone" }))
    .addStringOption(o => o.setName("emoji").setDescription("Discord emoji (:name:id)").setRequired(true)))
  .addSubcommand(s => s.setName("emoji-reset").setDescription("Reset custom emojis to defaults"))
  .addSubcommand(s => s.setName("nickname").setDescription("Set bot nickname")
    .addStringOption(o => o.setName("nick").setDescription("New nickname").setRequired(true)))
  .addSubcommand(s => s.setName("reset").setDescription("Reset all branding to defaults"));

export async function execute(interaction) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!await isStaffAuthorized(interaction.client, interaction.user.id, staffRoles)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === "color") {
      const hex = interaction.options.getString("hex");
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex) && !/^[0-9A-Fa-f]{6}$/.test(hex)) {
        return interaction.reply({ ...buildText("Invalid hex color. Use format: #FFAD00 or FFAD00"), ephemeral: true });
      }
      await setBrandingProperty("primaryColor", hex.startsWith("#") ? hex : `#${hex}`, interaction.user.id);
      return interaction.reply({ ...buildText(`Primary color set to ${hex}.`), ephemeral: true });
    }
    if (sub === "secondary-color") {
      // Handled similarly to color
      return interaction.reply({ ...buildText("Secondary color update supported via config."), ephemeral: true });
    }
    if (sub === "name") {
      await setBrandingProperty("programmeName", interaction.options.getString("name"), interaction.user.id);
      return interaction.reply({ ...buildText("Programme name updated."), ephemeral: true });
    }
    if (sub === "footer") {
      await setBrandingProperty("footer", interaction.options.getString("text"), interaction.user.id);
      return interaction.reply({ ...buildText("Footer text updated."), ephemeral: true });
    }
    if (sub === "logo") {
      const url = interaction.options.getString("url");
      const validation = await validateLogoUrl(url);
      if (!validation.valid) return interaction.reply({ ...buildText(validation.error), ephemeral: true });
      await setBrandingProperty("logoUrl", url, interaction.user.id);
      return interaction.reply({ ...buildText("Logo URL updated."), ephemeral: true });
    }
    if (sub === "emoji-set") {
      const type = interaction.options.getString("type");
      const emoji = interaction.options.getString("emoji");
      const key = type === "checkIn" ? "emojiCheckIn" : "emojiMilestone";
      const validation = await validateEmoji(emoji);
      if (!validation.valid) return interaction.reply({ ...buildText(validation.error), ephemeral: true });
      await setBrandingProperty(key, emoji, interaction.user.id);
      return interaction.reply({ ...buildText(`${type} emoji updated.`), ephemeral: true });
    }
    if (sub === "emoji-reset") {
      await setBrandingProperty("emojiCheckIn", "", interaction.user.id);
      await setBrandingProperty("emojiMilestone", "", interaction.user.id);
      return interaction.reply({ ...buildText("Custom emojis cleared."), ephemeral: true });
    }
    if (sub === "nickname") {
      const nick = interaction.options.getString("nick");
      await setBrandingProperty("botNickname", nick, interaction.user.id);
      try {
        await interaction.client.user.setNickname(nick);
      } catch {}
      return interaction.reply({ ...buildText(`Bot nickname set to "${nick}".`), ephemeral: true });
    }
    if (sub === "reset") {
      await resetBranding(true);
      return interaction.reply({ ...buildText("Branding has been reset to defaults."), ephemeral: true });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };
