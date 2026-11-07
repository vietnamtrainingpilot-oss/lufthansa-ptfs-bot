/**
 * /logflight flightnum:<number> — Log a flight as completed.
 */
import { SlashCommandBuilder } from "discord.js";
import { isFlightOpsAuthorized } from "../utils/permissions.js";
import { logFlight } from "../services/flightOps.js";
import { getDb } from "../services/firestore.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("logflight")
  .setDescription("Log a flight as completed (staff or host only)")
  .addStringOption((o) => o.setName("flightnum").setDescription("Flight number (e.g. VJ101)").setRequired(true));

export async function execute(interaction, client) {
  const flightNum = interaction.options.getString("flightnum");
  const db = getDb();
  const snap = await db.collection("flights").where("flightNumber", "==", flightNum).get();
  if (snap.empty) {
    return interaction.reply({ ...buildText("Flight not found."), ephemeral: true });
  }
  const flightId = snap.docs[0].id;

  // Check authorization
  const isOps = await isFlightOpsAuthorized(client, interaction.user.id);
  const isHost = snap.docs[0].data().hostId === interaction.user.id;
  if (!isOps && !isHost) {
    return interaction.reply({ ...buildText("You are not authorized to log this flight."), ephemeral: true });
  }

  await interaction.deferReply({ flags: 32768, ephemeral: true });
  try {
    await logFlight(flightId, client);
    await interaction.editReply({ ...buildText(`Flight VJ${flightNum} logged as completed.`) });
  } catch (e) {
    await interaction.editReply({ ...buildText("Failed: " + e.message) });
  }
}
