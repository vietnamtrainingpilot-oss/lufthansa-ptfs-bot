/**
 * /privacy — Privacy and deletion controls
 */
import { SlashCommandBuilder } from "discord.js";
import { deleteAccount } from "../services/members.js";
import { buildText } from "../utils/builders.js";
import config from "../config/config.js";

export const data = new SlashCommandBuilder()
  .setName("privacy")
  .setDescription("Privacy controls for your account")
  .addSubcommand(s => s.setName("delete").setDescription("Delete your account permanently"));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "delete") {
    const isOwner = interaction.user.id === config.botOwnerId;
    if (!isOwner) {
      return interaction.reply({ ...buildText("Only account owners can delete their account."), ephemeral: true });
    }
    try {
      await deleteAccount(interaction.user.id);
      return interaction.reply({ ...buildText("Your account has been deleted permanently."), ephemeral: true });
    } catch (e) {
      return interaction.reply({ ...buildText(`Failed: ${e.message}`), ephemeral: true });
    }
  }
  return interaction.reply({ ...buildText("Unknown command."), ephemeral: true });
}

export default { data, execute };