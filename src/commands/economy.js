/**
 * /economy � LH Credits virtual economy.
 *
 * Separate namespace from /rewards so the two balances are never confused.
 * Credits are a closed, non-cash, non-transferable virtual currency.
 */

import { SlashCommandBuilder } from "discord.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import { getLoyaltyConfig, updateLoyaltyConfig } from "../services/loyaltyStore.js";
import { applyLedgerEntry, writeAudit } from "../services/ledger.js";
import { CURRENCY } from "../config/loyaltyConfig.js";
import * as catalogue from "../services/catalogue.js";
import rewardsService from "../services/rewards.js";
import config from "../config/config.js";
import fmt from "../utils/loyaltyFormat.js";
import { ACCENT } from "../config/brand.js";

const STAFF_ROLES = () => [config.roleBoardOfDirectors, config.roleManagementTeam];

export const data = new SlashCommandBuilder()
  .setName("economy")
  .setDescription("LH Credits virtual economy")
  .addSubcommand((s) =>
    s.setName("balance").setDescription("View a LH Credits balance").addUserOption((o) =>
      o.setName("user").setDescription("Member to look up (defaults to you)")
    )
  )
  .addSubcommand((s) => s.setName("shop").setDescription("Browse the LH Credits shop"))
  .addSubcommand((s) =>
    s
      .setName("award")
      .setDescription("Award LH Credits to a member (staff)")
      .addUserOption((o) => o.setName("user").setDescription("Member to adjust").setRequired(true))
      .addIntegerOption((o) => o.setName("amount").setDescription("Positive whole number").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason (recorded in the audit log)").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("deduct")
      .setDescription("Deduct LH Credits from a member (staff)")
      .addUserOption((o) => o.setName("user").setDescription("Member to adjust").setRequired(true))
      .addIntegerOption((o) => o.setName("amount").setDescription("Positive whole number").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason (recorded in the audit log)").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("configure")
      .setDescription("Update credit configuration (staff)")
      .addStringOption((o) =>
        o.setName("set").setDescription("Configuration key").setRequired(true).addChoices(
          { name: "creditsPerHour", value: "creditsFormula.creditsPerHour" },
          { name: "minCreditsPerFlight", value: "creditsFormula.minCreditsPerFlight" },
          { name: "maxCreditsPerFlight", value: "creditsFormula.maxCreditsPerFlight" },
          { name: "creditsLabel", value: "branding.creditsLabel" },
          { name: "creditsUnit", value: "branding.creditsUnit" }
        )
      )
      .addNumberOption((o) => o.setName("value").setDescription("New value").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason (recorded in the audit log)").setRequired(true))
  );

export async function execute(interaction, client) {
  const sub = interaction.options.getSubcommand();
  const cfg = await getLoyaltyConfig();
  const b = cfg.branding;

  switch (sub) {
    case "balance": {
      const target = interaction.options.getUser("user") || interaction.user;
      const bal = await rewardsService.getEconomyBalance(target.id);
      const out = [`## ${b.creditsLabel}`, `> Balance: **${fmt.num(bal.credits)} ${b.creditsUnit}**`, ""];
      if (bal.recentActivity.length) {
        out.push("**Recent activity**");
        for (const h of bal.recentActivity.slice(0, 5)) {
          const sign = h.amount >= 0 ? "+" : "";
          out.push(`\`${sign}${fmt.num(h.amount)}\` ${fmt.safeText(h.reason, 60)}`);
        }
      } else {
        out.push("No activity yet. Complete a verified flight to earn credits.");
      }
      return interaction.reply(fmt.lines(out, { accentColor: ACCENT.DEFAULT }));
    }

    case "shop": {
      const items = await catalogue.listItems({ currency: CURRENCY.CREDITS });
      return interaction.reply(
        fmt.catalogueMessage(items, {
          title: `${b.creditsLabel} shop`,
          branding: b,
          actionPrefix: "buy_confirm",
        })
      );
    }

    case "award":
    case "deduct": {
      if (!(await isStaffAuthorized(client, interaction.user.id, STAFF_ROLES()))) {
        return interaction.reply(fmt.resultMessage("Not authorised", "This command is staff-only.", { ok: false }));
      }
      const amount = interaction.options.getInteger("amount");
      if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
        return interaction.reply(
          fmt.resultMessage("Invalid amount", "Amount must be a positive whole number no greater than 1,000,000.", { ok: false })
        );
      }
      const target = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");
      const signed = sub === "award" ? amount : -amount;

      const res = await applyLedgerEntry({
        userId: target.id,
        currency: CURRENCY.CREDITS,
        amount: signed,
        type: sub === "award" ? "staffAward" : "staffDeduct",
        reason,
        idempotencyKey: `staff${sub}:${target.id}:${amount}:${interaction.user.id}:${Date.now()}`,
        actorId: interaction.user.id,
        referenceType: "staff",
        metadata: { staffInitiated: true },
      });
      if (res.duplicate) {
        return interaction.reply(fmt.resultMessage("Already applied", "That request was already processed."));
      }
      await writeAudit({
        actorId: interaction.user.id,
        action: `economy_${sub}`,
        targetUserId: target.id,
        amount: signed,
        currency: CURRENCY.CREDITS,
        reason,
        referenceType: "staff",
      });

      return interaction.reply(
        fmt.resultMessage(
          `LH Credits ${sub === "award" ? "awarded" : "deducted"}`,
          `<@!${target.id}> ${signed > 0 ? "+" : ""}${signed} ${b.creditsUnit}. New balance: ${fmt.num(res.balance)}.`
        )
      );
    }

    case "configure": {
      if (!(await isStaffAuthorized(client, interaction.user.id, STAFF_ROLES()))) {
        return interaction.reply(fmt.resultMessage("Not authorised", "This command is staff-only.", { ok: false }));
      }
      const path = interaction.options.getString("set");
      const value = interaction.options.getNumber("value");
      const reason = interaction.options.getString("reason");
      const patch = {};
      const parts = path.split(".");
      let cur = patch;
      for (let i = 0; i < parts.length - 1; i++) {
        cur[parts[i]] = cur[parts[i]] || {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;

      try {
        const updated = await updateLoyaltyConfig(patch, interaction.user.id, reason);
        const resolved = parts.reduce((o, k) => (o == null ? o : o[k]), updated);
        return interaction.reply(fmt.resultMessage("Configuration updated", `${path} is now ${JSON.stringify(resolved)}.`));
      } catch (e) {
        return interaction.reply(fmt.resultMessage("Configuration rejected", e.message, { ok: false }));
      }
    }

    default:
      return interaction.reply(fmt.resultMessage("Unknown subcommand", "That subcommand is not available.", { ok: false }));
  }
}

export default { data, execute };
