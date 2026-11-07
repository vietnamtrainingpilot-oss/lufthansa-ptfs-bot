/**
 * flightInteractions.js — Flight operations interaction handlers.
 */

import { getDb } from "../services/firestore.js";
import config from "../config/config.js";
import { isFlightOpsAuthorized, isStaffAuthorized } from "../utils/permissions.js";
import { buildText } from "../utils/builders.js";

const COLLECTION = "flights";

/**
 * Handle staff role-claim button on flight briefing (e.g. Ground Crew, Cabin Crew).
 */
export async function handleFlightClaim(interaction, client) {
  // Parse: flight_claim_ground_<flightId> or flight_claim_cabin_<flightId>
  const parts = interaction.customId.split("_");
  const position = parts[2]; // ground or cabin
  const flightId = parts.slice(3).join("_");

  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(flightId).get();
  if (!doc.exists) {
    return interaction.reply({ ...buildText("Flight not found."), ephemeral: true });
  }

  const data = doc.data();
  if (data.status !== "scheduled") {
    return interaction.reply({ ...buildText("This flight is no longer scheduled."), ephemeral: true });
  }

  // Check authorization
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  const isStaff = await isStaffAuthorized(client, interaction.user.id, staffRoles);
  if (!isStaff) {
    return interaction.reply({ ...buildText("Staff authorization required."), ephemeral: true });
  }

  // Positions a staff member can sign up for on a single flight. This is a
  // per-flight signup list, NOT a server role assignment: nothing here grants a
  // permanent department role. Use /careers to assign department roles.
  const POSITIONS = {
    ground: { label: "Ground Crew" },
    cabin: { label: "Cabin Crew" },
  };
  const slot = POSITIONS[position];
  if (!slot) return interaction.reply({ ...buildText("Unknown position."), ephemeral: true });

  // Record the claim for THIS flight only.
  const existingClaims = data.staffClaims || [];
  const alreadyClaimed = existingClaims.some((c) => c.userId === interaction.user.id);
  if (alreadyClaimed) {
    return interaction.reply({ ...buildText("You have already claimed this position."), ephemeral: true });
  }

  await db.collection(COLLECTION).doc(flightId).update({
    staffClaims: [...existingClaims, { userId: interaction.user.id, role: position }],
  });

  await interaction.reply({
    ...buildText(`You have claimed the ${slot.label} position for VJ${data.flightNumber}.`),
    ephemeral: true,
  });
}

/**
 * Handle secondary flight staff buttons from the briefing channel.
 *
 * There is currently no producer of `flight_staff_click_*` buttons: the
 * briefing message ships role-claim buttons, which are handled by
 * handleFlightClaim. This handler exists so that a future staff button fails
 * with a clear message instead of leaving the interaction to time out.
 */
export async function handleFlightStaffClick(interaction) {
  return interaction.reply({
    ...buildText("This button is not active yet. Please use a flight command or ask a staff member."),
    ephemeral: true,
  });
}

export default { handleFlightClaim, handleFlightStaffClick };
