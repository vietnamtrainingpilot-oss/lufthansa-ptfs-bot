/**
 * booking.js — Bot-only flight booking interaction handlers.
 *
 * Design: AeroNexus 12.4 Booking Integration (bot-only variant).
 *
 * Flow:
 *   1. Flight announce message has a "Book This Flight" button (custom_id: book_flight_{flightId}).
 *   2. Clicking opens a modal with cabin class + seat preference.
 *   3. Modal submit records the booking in the manifest (upsertPassenger).
 *   4. Confirmation DM to member + notification to staff channel.
 *
 * No website required. All booking happens inside Discord.
 */
import { getDb } from "../services/firestore.js";
import config from "../config/config.js";
import { buildText, buildMessage } from "../utils/builders.js";
import { flightLabel } from "../config/brand.js";
import { upsertPassenger, ensureManifest } from "../services/manifest.js";
import { ACCENT } from "../config/brand.js";

const COLLECTION = "flights";

const ALLOWED_CABINS = ["economy", "premium", "business", "premium_economy"];

/**
 * Handle "Book This Flight" button click — open the booking modal.
 */
export async function handleBookFlightButton(interaction) {
  const flightId = interaction.customId.replace("book_flight_", "");
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(flightId).get();
  if (!doc.exists) {
    return interaction.reply({ ...buildText("Flight not found."), ephemeral: true });
  }
  const flight = doc.data();
  if (!["scheduled", "checkin"].includes(flight.status)) {
    return interaction.reply({ ...buildText("This flight is no longer accepting bookings."), ephemeral: true });
  }

  const modal = {
    title: `Book ${flightLabel(flight.flightNumber)}`,
    custom_id: `book_flight_modal_${flightId}`,
    components: [
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: "cabin_class",
            label: "Cabin class",
            style: 1,
            placeholder: "economy / premium / business",
            required: true,
            min_length: 1,
            max_length: 20,
          },
        ],
      },
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: "seat",
            label: "Seat preference (optional)",
            style: 1,
            placeholder: "e.g. 12A",
            required: false,
            min_length: 0,
            max_length: 8,
          },
        ],
      },
    ],
  };

  await interaction.showModal(modal);
}

/**
 * Handle booking modal submission — record the booking.
 */
export async function handleBookFlightModal(interaction, client) {
  const flightId = interaction.customId.replace("book_flight_modal_", "");
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(flightId).get();
  if (!doc.exists) {
    return interaction.reply({ ...buildText("Flight not found."), ephemeral: true });
  }
  const flight = doc.data();
  if (!["scheduled", "checkin"].includes(flight.status)) {
    return interaction.reply({ ...buildText("This flight is no longer accepting bookings."), ephemeral: true });
  }

  const cabinRaw = interaction.fields.getTextInputValue("cabin_class").trim().toLowerCase();
  const cabin = cabinRaw.replace(/\s+/g, "_");
  const seat = interaction.fields.getTextInputValue("seat").trim() || null;

  const allowed = ["economy", "premium", "premium_economy", "business"];
  if (!allowed.includes(cabin)) {
    return interaction.reply({ ...buildText("Invalid cabin class. Use: economy, premium, or business."), ephemeral: true });
  }

  const userId = interaction.user.id;

  await interaction.deferReply({ ephemeral: true });

  try {
    await ensureManifest(flightId, {
      flightNumber: flight.flightNumber,
      departure: flight.departureAirport,
      arrival: flight.arrivalAirport,
    });

    const passenger = await upsertPassenger(flightId, {
      userId,
      displayName: interaction.user.username,
      cabinClass: cabin === "premium_economy" ? "premium" : cabin,
      seat,
      bookingId: `bot-${flight.flightNumber}-${userId}`,
      bookingStatus: "confirmed",
      presenceStatus: "unmarked",
      eligible: true,
    });

    // DM confirmation to member
    try {
      await interaction.user.send(buildText(
        `Seat request confirmed.\n\n` +
        `Flight: ${flightLabel(flight.flightNumber)} (${flight.departureAirport} to ${flight.arrivalAirport})\n` +
        (seat ? `Seat: ${seat}\n` : "") +
        `Cabin: ${String(passenger.cabinClass).replace(/_/g, " ")}\n\n` +
        `Rewards are awarded after the flight is completed and your attendance is confirmed by staff.`
      ));
    } catch {
      // DMs may be closed; booking is still recorded.
    }

    // Notify staff channel
    const channelId = config.flightBookingStaffChannelId || config.flightLogChannelId;
    if (channelId) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel?.isTextBased?.()) {
          await channel.send(
            `Seat booked - ${flightLabel(flight.flightNumber)} (${flight.departureAirport} to ${flight.arrivalAirport}) - member <@${userId}> - ${String(passenger.cabinClass).replace(/_/g, " ")}${seat ? ` - seat ${seat}` : ""}`
          );
        }
      } catch {
        // Log channel unavailable; never fail the request.
      }
    }

    return interaction.editReply({
      ...buildMessage({
        accentColor: ACCENT.SUCCESS,
        text: [
          `Booking confirmed for ${flightLabel(flight.flightNumber)}.\n\n` +
          `Cabin: ${String(passenger.cabinClass).replace(/_/g, " ")}${seat ? `\nSeat: ${seat}` : ""}\n\n` +
          `Rewards are awarded after the flight is completed and your attendance is confirmed by staff.`,
        ],
      }),
      ephemeral: true,
    });
  } catch (e) {
    console.error("[booking] Failed:", e.message);
    return interaction.editReply({ ...buildText(`Booking failed: ${e.message}`), ephemeral: true });
  }
}

export default { handleBookFlightButton, handleBookFlightModal };
