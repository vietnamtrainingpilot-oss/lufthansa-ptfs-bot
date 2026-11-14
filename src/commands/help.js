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
    "• `/flight codes` — Show active claim codes (staff)",
    "• `/flight info` — View flight details (staff)",
    "",
    "**Rewards:**",
    "• `/shop` — Browse rewards catalog",
    "• `/redeem <name>` — Redeem miles for rewards",
    "• `/history` — View transaction history",
    "• `/redemptions pending/fulfil/refund` — Staff redemption management",
    "• `/reward add/remove/list` — Manage rewards catalog (staff)",
    "",
    "**Stats:**",
    "• `/achievements` — View achievements",
    "• `/achievement add/edit/remove` — Manage achievements (admin)",
    "• `/leaderboard` — Member rankings",
    "• `/daily` — Claim daily reward",
    "",
    "**Events & Alliances:**",
    "• `/event start/stop/status` — Manage loyalty events (staff)",
    "• `/alliance create/join/leave/info` — Manage airline alliances",
    "",
    "**Admin (Staff):**",
    "• `/adjust add/remove` — Award or deduct miles",
    "• `/setup` — Unified configuration wizard",
    "• `/tiers view/add/remove/rename/role/threshold/sync` — Manage tiers",
    "• `/route set/check/list/remove` — Manage flight routes",
    "",
    "**Branding:**",
    "• `/branding color/name/footer/logo/nickname/reset` — Customize appearance",
    "• `/custombot setup/status/remove` — Configure bot integrations",
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