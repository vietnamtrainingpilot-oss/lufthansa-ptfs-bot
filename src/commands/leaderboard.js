/**
 * /leaderboard — View member rankings
 */
import { SlashCommandBuilder } from "discord.js";
import { getDb } from "../services/firestore.js";
import { buildMessage, buildText } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("View member rankings")
  .addStringOption(o => o.setName("sort")
    .addChoices(
      { name: "Award Miles", value: "miles" },
      { name: "Total Flights", value: "flights" },
      { name: "Status Points", value: "points" }
    ));

export async function execute(interaction) {
  const sort = interaction.options.getString("sort") || "miles";
  try {
    const db = getDb();
    let snap;
    if (sort === "miles") snap = await db.collection("members").orderBy("awards.awardMiles.balance", "desc").limit(10).get();
    else if (sort === "points") snap = await db.collection("members").orderBy("membership.statusPoints", "desc").limit(10).get();
    else snap = await db.collection("members").orderBy("membership.totalFlights", "desc").limit(10).get();

    const lines = [
      `**Miles & More Leaderboard** — ${sort}`,
      "",
      ...snap.docs.slice(0, 10).map((d, i) => {
        const m = d.data();
        const val = sort === "miles" ? (m.awards?.awardMiles?.balance || 0).toLocaleString() :
          sort === "points" ? (m.membership?.statusPoints || 0).toLocaleString() :
          (m.membership?.totalFlights || 0);
        return `#${i+1}: <@!${m.userId}> — ${val}`;
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