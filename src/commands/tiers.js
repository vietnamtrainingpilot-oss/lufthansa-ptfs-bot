/**
 * /tiers — Manage membership tiers (admin only)
 */
import { SlashCommandBuilder } from "discord.js";
import { getDb } from "../services/firestore.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { TIERS } from "../services/members.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("tiers")
  .setDescription("Manage membership tiers (admin)")
  .addSubcommand(s => s.setName("view").setDescription("View current tier configuration"))
  .addSubcommand(s => s.setName("set-points").setDescription("Set status points threshold for a tier")
    .addStringOption(o => o.setName("tier").setDescription("Tier name").setRequired(true)
      .addChoices(
        { name: "Frequent Traveller", value: "frequentTraveler" },
        { name: "Senator", value: "senator" },
        { name: "HON Circle", value: "honCircle" }
      ))
    .addIntegerOption(o => o.setName("points").setDescription("Status points threshold").setRequired(true)));

export async function execute(interaction) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!await isStaffAuthorized(interaction.client, interaction.user.id, staffRoles)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }
  
  const sub = interaction.options.getSubcommand();
  
  try {
    if (sub === "view") {
      const lines = [
        "**Membership Tiers**",
        "",
        ...Object.entries(TIERS).map(([tier, cfg]) => 
          `• ${tier}: ${cfg.statusPoints} status points required`
        ),
        ""
      ];
      return interaction.reply({ ...buildText(lines.join("\n")), ephemeral: true });
    }
    
    if (sub === "set-points") {
      const tier = interaction.options.getString("tier");
      const points = interaction.options.getInteger("points");
      
      const db = getDb();
      await db.collection("config").doc("mileageTiers").update({
        [tier]: {
          ...(await db.collection("config").doc("mileageTiers").get()).data()?.[tier] || {},
          statusPoints: points,
        }
      });
      
      return interaction.reply({
        ...buildText(`Updated ${tier} threshold to ${points} status points.`),
        ephemeral: true
      });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Failed: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };