/**
 * /leaderboard — View Miles & More rankings
 */
import { SlashCommandBuilder } from "discord.js";
import { getDb } from "../services/firestore.js";
import { buildMessage } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("View member rankings")
  .addStringOption(o => o.setName("sort")
    .setDescription("Sort by")
    .addChoices(
      { name: "Award Miles", value: "miles" },
      { name: "Total Flights", value: "flights" },
      { name: "Status Points", value: "points" }
    ));

export async function execute(interaction) {
  const sort = interaction.options.getString("sort") || "miles";
  
  try {
    const db = getDb();
    
    let query;
    if (sort === "miles") {
      query = db.collection("members").orderBy("awards.awardMiles.balance", "DESC").limit(10);
    } else if (sort === "points") {
      query = db.collection("members").orderBy("membership.statusPoints", "DESC").limit(10);
    } else {
      // count flights
      const snap = await db.collection("members").get();
      const sorted = snap.docs.map(d => ({ id: d.id, flights: d.data()?.history?.totalFlights || 0 }))
        .sort((a, b) => b.flights - a.flights).slice(0, 10);
      
      const lines = ["**Leaderboard — Most Flights**", "", ...sorted.map((e, i) => 
        `#${i+1}: ${e.id} (${e.flights} flights)`
      )];
      
      return interaction.reply({ ...buildText(lines.join("\n")), ephemeral: true });
    }
    
    const snap = await query.get();
    const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const lines = [
      `**Miles & More Leaderboard** — ${sort}`,
      "",
      ...members.slice(0, 10).map((m, i) => {
        const miles = m.awards?.awardMiles?.balance?.toLocaleString() || 0;
        const tier = m.membership?.tier || "Frequent Traveller";
        return `#${i+1}: <@!${m.id}> — ${miles} miles | ${tier}`;
      })
    ];
    
    return interaction.reply({
      ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [lines.join("\n")] }),
      ephemeral: true
    });
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };