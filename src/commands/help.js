/**
 * /help — Show available commands
 */
import { SlashCommandBuilder } from "discord.js";
import { buildMessage } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show available commands");

export async function execute(interaction) {
  const lines = [
    "**Lufthansa Miles & More — Commands**",
    "",
    "**Membership:**",
    "• `/sign-up` — Register for Miles & More",
    "• `/miles` — View your account",
    "• `/premium` — Check tier and benefits",
    "",
    "**Flights:**",
    "• `/claim <code>` — Claim flight miles",
    "• `/flight create` — Create flight (staff)",
    "• `/flight add` — Manual passenger registration (staff)",
    "• `/flight close` — Close flight claims (staff)",
    "• `/flight void` — Void a flight (staff)",
    "",
    "**Rewards:**",
    "• `/shop` — Browse rewards catalog",
    "• `/redeem <name>` — Redeem miles for rewards",
    "• `/history` — View transaction history",
    "",
    "**Stats:**",
    "• `/achievements` — View achievements",
    "• `/leaderboard` — Member rankings",
    "• `/daily` — Claim daily reward",
    "",
    "**Admin (Staff):**",
    "• `/adjust add/remove` — Award or deduct miles",
    "• `/setup` — Configure system settings",
    "• `/tiers` — Manage membership tiers",
    "• `/route` — Manage flight routes",
    "",
    "**Privacy:**",
    "• `/privacy delete` — Delete your account"
  ];
  return interaction.reply({
    ...buildMessage({ accentColor: ACCENT.DEFAULT, text: [lines.join("\n")] }),
    ephemeral: true
  });
}

export default { data, execute };