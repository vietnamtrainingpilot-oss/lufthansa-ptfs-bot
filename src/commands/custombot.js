/**
 * /custombot — Custom bot integration management
 */
import { SlashCommandBuilder } from "discord.js";
import { setupCustomBot, getCustomBotStatus, removeCustomBot } from "../services/customBot.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("custombot")
  .setDescription("Manage custom bot integrations (admin)")
  .addSubcommand(s => s.setName("setup").setDescription("Configure a custom bot integration")
    .addStringOption(o => o.setName("type").setDescription("Integration type").setRequired(true)
      .addChoices({ name: "webhook", value: "webhook" }, { name: "api", value: "api" }))
    .addStringOption(o => o.setName("app_name").setDescription("Application name").setRequired(true))
    .addStringOption(o => o.setName("token").setDescription("Bot token (stored securely, never logged)").setRequired(true))
    .addStringOption(o => o.setName("client_id").setDescription("Client ID").setRequired(false))
    .addStringOption(o => o.setName("webhook_url").setDescription("Webhook URL for callbacks").setRequired(false)))
  .addSubcommand(s => s.setName("status").setDescription("View integration status"))
  .addSubcommand(s => s.setName("remove").setDescription("Remove the current integration"));

export async function execute(interaction) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!await isStaffAuthorized(interaction.client, interaction.user.id, staffRoles)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === "setup") {
      // AES-256-GCM master key must be configured in env before any custom bot can be stored.
      if (!process.env.CUSTOM_BOT_MASTER_KEY) {
        return interaction.reply({
          ...buildText("Custom bot credentials require a server-side encryption key.\nSet `CUSTOM_BOT_MASTER_KEY` (64-char hex) in your environment and restart the bot, then retry."),
          ephemeral: true,
        });
      }
      const result = await setupCustomBot({
        type: interaction.options.getString("type"),
        appName: interaction.options.getString("app_name"),
        botToken: interaction.options.getString("token"),
        webhookUrl: interaction.options.getString("webhook_url"),
        clientId: interaction.options.getString("client_id"),
        configuredBy: interaction.user.id,
      });
      return interaction.reply({
        ...buildText(`Custom bot integrated.\nApp: ${result.appName}\nType: ${result.type}\nToken: ${result.maskedToken}`),
        ephemeral: true,
      });
    }
    if (sub === "status") {
      const status = await getCustomBotStatus();
      if (!status) return interaction.reply({ ...buildText("No active custom bot integration."), ephemeral: true });
      return interaction.reply({
        ...buildText(`**Custom Bot Status**\n\nApp: ${status.appName}\nType: ${status.type}\nStatus: ${status.status}\nLast Check: ${status.lastCheckedAt ? new Date(status.lastCheckedAt).toLocaleString() : "Never"}\nMasked Token: ${status.maskedToken}`),
        ephemeral: true,
      });
    }
    if (sub === "remove") {
      const removed = await removeCustomBot();
      return interaction.reply({ ...buildText(removed ? "Integration removed." : "No active integration to remove."), ephemeral: true });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };
