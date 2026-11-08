/**
 * loyaltyInteractions.js — Confirmation flows for catalogue/shop/missions.
 *
 * Every mutation here re-reads price, stock and eligibility from Firestore.
 * Nothing from the interaction payload (labels, prices) is trusted for logic.
 */

import { transactItem, getItem, refundRedemption, fulfillRedemption, FULFILMENT } from "../services/catalogue.js";
import { claimMissionReward, getMemberMissions } from "../services/missions.js";
import { getLoyaltyConfig } from "../services/loyaltyStore.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import fmt from "../utils/loyaltyFormat.js";
import { ACCENT } from "../config/brand.js";

/** Build the confirm step for a redemption or purchase. */
async function buildConfirm(interaction, item, action) {
  const cfg = await getLoyaltyConfig();
  const unit = item.currency === "credits" ? cfg.branding.creditsUnit : cfg.branding.pointsUnit;
  const verb = action === "buy" ? "purchase" : "redeem";

  return {
    flags: 32768,
    components: [
      {
        type: 17,
        accent_color: ACCENT.DEFAULT,
        components: [
          {
            type: 10,
            content:
              `## Confirm ${verb}\n**Item:** ${fmt.safeText(item.displayName, 80)}\n` +
              `**Cost:** ${fmt.num(item.price)} ${unit}\n` +
              `**Fulfilment:** ${item.fulfillment === FULFILMENT.INSTANT ? "Granted immediately" : "Waiting for staff fulfilment"}\n\n` +
              `> ${fmt.safeText(item.description, 300)}`,
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3,
                label: action === "buy" ? "Confirm purchase" : "Confirm redemption",
                custom_id: `${action}_do:${item.id}`,
              },
              { type: 2, style: 2, label: "Cancel", custom_id: `${action}_cancel` },
            ],
          },
        ],
      },
    ],
  };
}

export async function handleLoyaltyInteraction(interaction, client) {
  const id = interaction.customId || "";
  const [action, ...rest] = id.split(":");

  /* ── Catalogue: redeem ─────────────────────────────────────────────────── */
  if (action === "redeem_confirm") {
    const item = await getItem(rest[0]);
    if (!item) return interaction.reply(fmt.resultMessage("Unavailable", "That item no longer exists.", { ok: false }));
    return interaction.update(await buildConfirm(interaction, item, "redeem"));
  }

  if (action === "redeem_cancel") {
    return interaction.update(fmt.resultMessage("Cancelled", "No points were spent.", { ok: true }));
  }

  if (action === "redeem_do") {
    const item = await getItem(rest[0]);
    if (!item) return interaction.update(fmt.resultMessage("Unavailable", "That item no longer exists.", { ok: false }));
    return interaction.deferReply({ flags: 32768, ephemeral: true }).then(async () => {
      try {
        const idempotencyKey = `redeem:${interaction.user.id}:${item.id}:${interaction.id}`;
        const res = await transactItem({ userId: interaction.user.id, itemId: item.id, idempotencyKey });
        await interaction.editReply(fmt.resultMessage(res.duplicate ? "Already processed" : "Redemption submitted", res.message));
        await interaction.update(fmt.resultMessage("Redemption complete", res.message));
      } catch (e) {
        await interaction.editReply(fmt.resultMessage("Redemption failed", e.message, { ok: false }));
      }
    });
  }

  /* ── Shop: buy ─────────────────────────────────────────────────────────── */
  if (action === "buy_confirm") {
    const item = await getItem(rest[0]);
    if (!item) return interaction.reply(fmt.resultMessage("Unavailable", "That item no longer exists.", { ok: false }));
    return interaction.update(await buildConfirm(interaction, item, "buy"));
  }

  if (action === "buy_cancel") {
    return interaction.update(fmt.resultMessage("Cancelled", "No credits were spent.", { ok: true }));
  }

  if (action === "buy_do") {
    const item = await getItem(rest[0]);
    if (!item) return interaction.update(fmt.resultMessage("Unavailable", "That item no longer exists.", { ok: false }));
    await interaction.deferReply({ flags: 32768, ephemeral: true });
    try {
      const idempotencyKey = `buy:${interaction.user.id}:${item.id}:${interaction.id}`;
      const res = await transactItem({ userId: interaction.user.id, itemId: item.id, idempotencyKey });
      await interaction.editReply(fmt.resultMessage(res.duplicate ? "Already processed" : "Purchase submitted", res.message));
      await interaction.update(fmt.resultMessage("Purchase complete", res.message));
    } catch (e) {
      await interaction.editReply(fmt.resultMessage("Purchase failed", e.message, { ok: false }));
    }
    return;
  }

  /* ── Missions: claim ───────────────────────────────────────────────────── */
  if (action === "mission_claim") {
    const missionId = rest[0];
    await interaction.deferReply({ flags: 32768, ephemeral: true });
    try {
      const res = await claimMissionReward({ userId: interaction.user.id, missionId });
      const cfg = await getLoyaltyConfig();
      const unit = res.rewardCurrency === "credits" ? cfg.branding.creditsUnit : cfg.branding.pointsUnit;
      await interaction.editReply(
        fmt.resultMessage("Mission reward claimed", `You received ${fmt.num(res.rewardAmount)} ${unit}.`)
      );
    } catch (e) {
      await interaction.editReply(fmt.resultMessage("Could not claim", e.message, { ok: false }));
    }
    return;
  }

  /* ── Staff: fulfil / refund a pending request ──────────────────────────── */
  if (action === "fulfil_do" || action === "refund_do") {
    const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
    if (!(await isStaffAuthorized(client, interaction.user.id, staffRoles))) {
      return interaction.reply(fmt.resultMessage("Not authorised", "Staff-only action.", { ok: false }));
    }
    const redemptionId = rest[0];
    await interaction.deferReply({ flags: 32768, ephemeral: true });
    try {
      if (action === "fulfil_do") {
        await fulfillRedemption(redemptionId, interaction.user.id);
        await interaction.editReply(fmt.resultMessage("Fulfilled", "The request has been marked as fulfilled."));
      } else {
        await refundRedemption(redemptionId, interaction.user.id, "Staff refund");
        await interaction.editReply(fmt.resultMessage("Refunded", "A compensating ledger entry was created."));
      }
      await interaction.update(fmt.resultMessage("Done", "The request has been updated."));
    } catch (e) {
      await interaction.editReply(fmt.resultMessage("Action failed", e.message, { ok: false }));
    }
    return;
  }

  /* ── Missions list with claim buttons ──────────────────────────────────── */
  if (action === "missions_show") {
    const list = await getMemberMissions(interaction.user.id);
    const cfg = await getLoyaltyConfig();
    const msg = fmt.missionsMessage(list, cfg.branding);
    const claimable = list.filter((m) => m.claimable).slice(0, 5);
    if (claimable.length) {
      msg.components.push({
        type: 17,
        components: [
          {
            type: 1,
            components: claimable.map((m) => ({
              type: 2,
              style: 3,
              label: fmt.safeText(m.title, 80),
              custom_id: `mission_claim:${m.id}`,
            })),
          },
        ],
      });
    }
    return interaction.reply(msg);
  }
}

export default { handleLoyaltyInteraction };