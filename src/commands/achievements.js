/**
 * /achievements — View member achievements
 */
import { SlashCommandBuilder } from "discord.js";
import { getMemberAccount } from "../services/members.js";
import { getDb } from "../services/firestore.js";
import { buildMessage } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("achievements")
  .setDescription("View your achievements")
  .addUserOption(o => o.setName("user").setDescription("Another member"));

export async function execute(interaction) {
  const target = interaction.options.getUser("user") || interaction.user;
  
  try {
    const account = await getMemberAccount(target.id);
    const db = getDb();
    
    // Get achievements for this user
    const snap = await db.collection("achievements").where("userId", "==", target.id).get();
    const unlocked = snap.docs.map(d => d.data().name || d.data().achievementId);
    
    // Standard achievements based on stats
    const milestones = [];
    if ((account.history?.totalFlights || 0) >= 1) milestones.push("First Flight");
    if ((account.history?.totalFlights || 0) >= 10) milestones.push("Veteran Traveler");
    if ((account.history?.totalFlights || 0) >= 50) milestones.push("Frequent Flyer");
    if ((account.membership?.statusPoints || 0) >= 650) milestones.push("Frequent Traveller");
    if ((account.membership?.statusPoints || 0) >= 2000) milestones.push("Senator");
    if ((account.awards?.awardMiles?.lifetimeEarned || 0) >= 1000) milestones.push("Miler");
    if ((account.awards?.awardMiles?.lifetimeEarned || 0) >= 10000) milestones.push("Century");
    
    const allAchievements = [...new Set([...unlocked, ...milestones])];
    
    const lines = [
      `**Achievements — ${target.displayName}`,
      "",
      `Unlocked: ${allAchievements.length}`,
      "",
      ...allAchievements.slice(0, 10).map(a => `* ${a}`)
    ];
    
    return interaction.reply({
      ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [lines.join("\n")] }),
      ephemeral: true
    });
  } catch (e) {
    return interaction.reply({ 
      ...buildText(`Not registered. Use /sign-up first.`), 
      ephemeral: true 
    });
  }
}

export default { data, execute };