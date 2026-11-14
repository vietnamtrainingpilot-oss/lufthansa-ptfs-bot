/**
 * /redemptions — Staff redemption management commands
 */
import { SlashCommandBuilder } from "discord.js";
import { listPendingRedemptions, fulfillRedemption, refundRedemption } from "../services/redemptions.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText, buildMessage } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("redemptions")
  .setDescription("Manage redemptions (staff)")
  .addSubcommand(s => s.setName("pending").setDescription("View pending redemptions"))
  .addSubcommand(s => s.setName("fulfil").setDescription("Mark a redemption as fulfilled")
    .addStringOption(o => o.setName("redemption_id").setDescription("Redemption ID").setRequired(true))
    .addStringOption(o => o.setName("notes").setDescription("Optional notes").setRequired(false)))
  .addSubcommand(s => s.setName("refund").setDescription("Refund a redemption")
    .addStringOption(o => o.setName("redemption_id").setDescription("Redemption ID").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for refund").setRequired(true)));

export async function execute(interaction) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!await isStaffAuthorized(interaction.client, interaction.user.id, staffRoles)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === "pending") {
      const pendings = await listPendingRedemptions();
      if (pendings.length === 0) {
        return interaction.reply({ ...buildText("No pending redemptions."), ephemeral: true });
      }
      const lines = ["**Pending Redemptions**", "",
        ...pendings.map(r =>
          `• **${r.id}** — <@!${r.userId}>: ${r.reward?.name || "Unknown"} (${r.milesDeducted?.toLocaleString()} miles)\n  Submitted: ${new Date(r.createdAt?.seconds * 1000 || r.createdAt).toLocaleString()}`
        )
      ];
      return interaction.reply({ ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [lines.join("\n")] }), ephemeral: true });
    }
    if (sub === "fulfil") {
      const redemptionId = interaction.options.getString("redemption_id");
      const notes = interaction.options.getString("notes");
      await fulfillRedemption(redemptionId, interaction.user.id);
      const msg = notes ? `Redemption fulfilled.${notes ? ` Notes: ${notes}` : ""}` : "Redemption fulfilled.";
      return interaction.reply({ ...buildText(msg), ephemeral: true });
    }
    if (sub === "refund") {
      const redemptionId = interaction.options.getString("redemption_id");
      const reason = interaction.options.getString("reason");
      await refundRedemption({ redemptionId, reason });
      return interaction.reply({ ...buildText(`Redemption refunded. Reason: ${reason}`), ephemeral: true });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };
