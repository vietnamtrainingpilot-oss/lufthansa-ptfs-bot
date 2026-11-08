/**
 * /flightupdate flightnum:<number> [delay:<minutes>|cancel]
 */
import { SlashCommandBuilder } from "discord.js";
import { isFlightOpsAuthorized } from "../utils/permissions.js";
import { updateFlight } from "../services/flightOps.js";
import { getDb } from "../services/firestore.js";
import { buildText } from "../utils/builders.js";
import { flightLabel, isValidFlightNumber, normalizeFlightNumber } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("flightupdate")
  .setDescription("Update a flight (delay or cancel)")
  .addStringOption((o) => o.setName("flightnum").setDescription("Flight number (e.g. LH 101)").setRequired(true))
  .addStringOption((o) =>
    o.setName("action").setDescription("delay or cancel").setRequired(true).addChoices(
      { name: "Delay", value: "delay" },
      { name: "Cancel", value: "cancel" }
    )
  )
  .addIntegerOption((o) => o.setName("delayminutes").setDescription("Delay in minutes (only for delay)").setRequired(false));

export async function execute(interaction, client) {
  if (!(await isFlightOpsAuthorized(client, interaction.user.id))) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }

  const flightNumInput = interaction.options.getString("flightnum");
  if (!isValidFlightNumber(flightNumInput)) {
    return interaction.reply({ ...buildText(`Invalid flight number. Use the format shown in briefings, for example ${flightLabel("101")}.`), ephemeral: true });
  }
  const flightNum = normalizeFlightNumber(flightNumInput);
  const action = interaction.options.getString("action");
  const delayMinutes = interaction.options.getInteger("delayminutes");
  const db = getDb();
  const snap = await db.collection("flights").where("flightNumber", "==", flightNum).get();
  if (snap.empty) {
    return interaction.reply({ ...buildText("Flight not found."), ephemeral: true });
  }
  const flightId = snap.docs[0].id;

  await interaction.deferReply({ flags: 32768, ephemeral: true });
  try {
    if (action === "delay" && delayMinutes) {
      const current = snap.docs[0].data();
      const newTime = current.scheduledUnixTime + delayMinutes * 60;
      await updateFlight(flightId, { scheduledUnixTime: newTime }, "delay", client);
      await interaction.editReply({ ...buildText(`${flightLabel(flightNum)} delayed by ${delayMinutes} minutes.`) });
    } else if (action === "cancel") {
      await updateFlight(flightId, {}, "cancel", client);
      await interaction.editReply({ ...buildText(`${flightLabel(flightNum)} cancelled.`) });
    } else {
      await interaction.editReply({ ...buildText("Invalid update parameters.") });
    }
  } catch (e) {
    await interaction.editReply({ ...buildText("Failed: " + e.message) });
  }
}
