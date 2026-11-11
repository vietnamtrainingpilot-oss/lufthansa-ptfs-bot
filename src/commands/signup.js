/**
 * /sign-up — Register for Miles & More
 */
import { SlashCommandBuilder } from "discord.js";
import { signUpClient } from "../services/members.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("sign-up")
  .setDescription("Register for Miles & More")
  .addStringOption(o =>
    o.setName("password")
      .setDescription("Password (8+ characters)")
      .setRequired(true)
  );

export async function execute(interaction) {
  const password = interaction.options.getString("password");
  
  try {
    await signUpClient(interaction.user, password);
    return interaction.reply({
      ...buildText(
        `Welcome to Miles & More, ${interaction.user.username}!\n\n` +
        `Your account has been created. Start claiming flights to earn Award Miles.`
      ),
      ephemeral: true
    });
  } catch (e) {
    return interaction.reply({
      ...buildText(`Registration failed: ${e.message}`),
      ephemeral: true
    });
  }
}

export default { data, execute };