/**
 * flightOps.js — Flight operations service.
 * Handles createflight, logflight, flightupdate, and auto check-in timers.
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import { createTimer } from "../timers/timers.js";
import config from "../config/config.js";
import { buildMessage, buildText } from "../utils/builders.js";
import { flightLabel, AIRLINE_NAME, COMMUNITY_NAME, ACCENT } from "../config/brand.js";

const COLLECTION = "flights";

/**
 * Create a new flight record in Firestore and post to announce/briefing channels.
 *
 * @param {object} params
 * @param {string} params.flightNumber
 * @param {string} params.hostId
 * @param {number} params.scheduledUnixTime
 * @param {string} params.departureAirport
 * @param {string} params.arrivalAirport
 * @param {string} params.aircraft
 * @param {string} params.classes
 * @param {string} params.privateServerLink
 * @param {string} params.spawnLocation
 * @param {string} params.gateNumber
 * @param {number} params.flightTimeMinutes
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<object>} flight record
 */
export async function createFlight({
  flightNumber,
  hostId,
  scheduledUnixTime,
  departureAirport,
  arrivalAirport,
  aircraft,
  classes,
  privateServerLink,
  spawnLocation,
  gateNumber,
  flightTimeMinutes,
  client,
  guild,
}) {
  const db = getDb();

  // Check for duplicate flight number
  const existing = await db
    .collection(COLLECTION)
    .where("flightNumber", "==", flightNumber)
    .get();
  if (!existing.empty) {
    throw new Error(`Flight ${flightNumber} already exists`);
  }

  // Create Discord Scheduled Event
  const event = await guild.events.create({
    name: flightLabel(flightNumber),
    scheduledStartTime: new Date(scheduledUnixTime * 1000),
    entityType: "EXTERNAL",
    description: `**${flightLabel(flightNumber)}**\n\n | **Departure:** ${departureAirport}\n | **Arrival:** ${arrivalAirport}\n | **Operating Aircraft:** ${aircraft}\n\n\u2139 | **Classes:** Premium, Economy (Business class depending on aircraft)\n | **Flight Time:** ${flightTimeMinutes}\n\n | **Thank you for choosing ${AIRLINE_NAME} for this flight.**`,
    entityMetadata: { location: "Discord Event" },
  });

  const eventId = event.id;
  const eventLink = `<https://discord.com/events/${guild.id}/${eventId}>`;

  const flightId = db.collection(COLLECTION).doc().id;
  const flightData = {
    id: flightId,
    flightNumber,
    hostId,
    departureAirport,
    arrivalAirport,
    aircraft,
    classes,
    privateServerLink,
    spawnLocation,
    gateNumber,
    flightTimeMinutes,
    scheduledUnixTime,
    discordEventId: eventId,
    discordEventLink: eventLink,
    status: "scheduled",
    staffClaims: [],
    createdAt: new Date(),
  };
  await db.collection(COLLECTION).doc(flightId).set(flightData);

  // Post preview to announce channel
  const announceChannel = await client.channels.fetch(config.flightAnnounceChannelId);
  if (announceChannel && announceChannel.isTextBased()) {
    const previewMsg = buildMessage({
      accentColor: ACCENT.DEFAULT,
      text: [
        `## ${flightLabel(flightNumber)} \n-# Hosted By: ${hostId} \n> You're all set to fly! For **${flightLabel(flightNumber)}**. More information may be found in the event link and below.\n\n> **Departing:** ${departureAirport}\n> **Arriving:** ${arrivalAirport}\n> **Flight Time:** ${flightTimeMinutes} minutes\n> **Aircraft:** ${aircraft}\n> **Event Link:** ${eventLink}\n> \u2139 **Classes:** ${classes}\n\n-# <@&${config.flightPingRoleId1}> <@&${config.flightPingRoleId2}>`,
      ],
      buttons: [
        { label: "Book This Flight", style: 5, url: config.bookingWebsiteBaseUrl + "/book?flight=" + flightNumber },
      ],
    });
    await announceChannel.send(previewMsg);
  }

  // Post briefing to staff channel with role-claim buttons
  const briefingChannel = await client.channels.fetch(config.flightBriefingChannelId);
  if (briefingChannel && briefingChannel.isTextBased()) {
    const briefContent = `## ${flightLabel(flightNumber)} Staff Briefing\n` +
      `**Departure:** ${departureAirport} | **Arrival:** ${arrivalAirport} | **Aircraft:** ${aircraft}\n` +
      `**Scheduled:** ${new Date(scheduledUnixTime * 1000).toLocaleString()} | **Gate:** ${gateNumber}\n` +
      `**Spawn:** ${spawnLocation} | **Private Server:** ${privateServerLink}\n` +
      `**Host:** ${hostId}\n\n> Claim a position below to staff this flight.`;
    await briefingChannel.send({
      flags: 32768,
      content: briefContent,
      components: [
        {
          type: 17,
          accent_color: ACCENT.DEFAULT,
          components: [
            { type: 10, content: "Staff Positions for " + flightLabel(flightNumber) },
            { type: 14 },
            {
              type: 1,
              components: [
                { type: 2, style: 1, label: "Ground Crew", custom_id: "flight_claim_ground_" + flightId },
                { type: 2, style: 1, label: "Cabin Crew", custom_id: "flight_claim_cabin_" + flightId },
              ],
            },
          ],
        },
      ],
    });
  }

  // Schedule check-in timer (fires at scheduled time)
  const checkinTime = scheduledUnixTime * 1000;
  await createTimer({
    type: "flightCheckin",
    dueAt: new Date(checkinTime),
    guildId: guild.id,
    payload: { flightId, flightNumber, spawnLocation, gateNumber, eventLink, privateServerLink, scheduledUnixTime },
  });

  return flightData;
}

/**
 * Log a flight as completed.
 *
 * @param {string} flightId
 * @param {import('discord.js').Client} client
 * @returns {Promise<object>}
 */
export async function logFlight(flightId, client) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(flightId).get();
  if (!doc.exists) throw new Error("Flight not found");

  const data = doc.data();
  await db.collection(COLLECTION).doc(flightId).update({
    status: "completed",
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Cancel any pending check-in timers for this flight
  try {
    const timerSnap = await db.collection("timers")
      .where("payload.flightId", "==", flightId)
      .where("fired", "==", false)
      .get();
    for (const tDoc of timerSnap.docs) {
      await db.collection("timers").doc(tDoc.id).update({ fired: true });
    }
  } catch (e) { /* ignore */ }

  // Post log to flight log channel
  const logChannel = await client.channels.fetch(config.flightLogChannelId);
  if (logChannel && logChannel.isTextBased()) {
    const staffList = (data.staffClaims || []).length > 0
      ? data.staffClaims.map(c => c.userId).join(", ")
      : "None";
    const logMsg = `## ${flightLabel(data.flightNumber)} Completed\n` +
      `**Flight ID:** ${data.id}\n` +
      `**Departure:** ${data.departureAirport} -> **Arrival:** ${data.arrivalAirport}\n` +
      `**Aircraft:** ${data.aircraft} | **Flight Time:** ${data.flightTimeMinutes} min\n` +
      `**Host:** ${data.hostId} | **Staff Claims:** ${staffList}\n` +
      `**Completed At:** ${new Date().toISOString()}`;
    await logChannel.send(buildText(logMsg));
  }

  // Delete scheduled event if possible
  try {
    const guild = await client.guilds.fetch(config.guildIdMain);
    const event = await guild.events.fetch(data.discordEventId).catch(() => null);
    if (event) await event.delete("Flight completed");
  } catch (e) {
    console.log("[flightops] Could not delete event:", e.message);
  }

  return { ...data, id: flightId };
}

/**
 * Update a flight (delay or cancel).
 *
 * @param {string} flightId
 * @param {object} updates
 * @param {"delay"|"cancel"} updateType
 * @param {import('discord.js').Client} client
 * @returns {Promise<void>}
 */
export async function updateFlight(flightId, updates, updateType, client) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(flightId).get();
  if (!doc.exists) throw new Error("Flight not found");

  const data = doc.data();
  await db.collection(COLLECTION).doc(flightId).update(updates);

  if (updateType === "delay") {
    // Cancel old check-in timer and schedule new one
    try {
      const timerSnap = await db.collection("timers")
        .where("payload.flightId", "==", flightId)
        .where("fired", "==", false)
        .get();
      for (const tDoc of timerSnap.docs) {
        await db.collection("timers").doc(tDoc.id).update({ fired: true });
      }
      // Re-schedule
      await createTimer({
        type: "flightCheckin",
        dueAt: new Date((updates.scheduledUnixTime || data.scheduledUnixTime) * 1000),
        guildId: config.guildIdMain,
        payload: { flightId, flightNumber: data.flightNumber, ...data },
      });
    } catch (e) {
      console.error("[flightops] Timer reschedule failed:", e.message);
    }

    // Post delay notice to announce channel
    const announceChannel = await client.channels.fetch(config.flightAnnounceChannelId);
    if (announceChannel && announceChannel.isTextBased()) {
      const delayNotice = `# Delay Notice\n\n> Dear Passengers, ${AIRLINE_NAME} Flight **${flightLabel(data.flightNumber)}** on service to ${data.arrivalAirport} has been delayed.\n\n> We apologize on this issue and hope to see everyone onboard.`;
      await announceChannel.send(buildText(delayNotice));
    }
  } else if (updateType === "cancel") {
    // A cancelled flight must NOT run the completion path: that would mark it
    // "completed", post a completion log, and delete the scheduled event as if
    // the flight had flown. Cancel pending timers, set the correct status, and
    // tell members. Rewards are never granted for a cancelled flight.
    try {
      const timerSnap = await db.collection("timers")
        .where("payload.flightId", "==", flightId)
        .where("fired", "==", false)
        .get();
      for (const tDoc of timerSnap.docs) {
        await db.collection("timers").doc(tDoc.id).update({ fired: true });
      }
    } catch (e) {
      console.error("[flightops] Could not cancel timers:", e.message);
    }

    try {
      const guild = await client.guilds.fetch(config.guildIdMain);
      const event = await guild.events.fetch(data.discordEventId).catch(() => null);
      if (event) await event.delete("Flight cancelled");
    } catch (e) {
      console.log("[flightops] Could not delete event:", e.message);
    }

    const announceChannel = await client.channels.fetch(config.flightAnnounceChannelId).catch(() => null);
    if (announceChannel && announceChannel.isTextBased()) {
      const cancelNotice =
        `# Cancellation Notice\n\n> ${COMMUNITY_NAME} Flight **${flightLabel(data.flightNumber)}** to ${data.arrivalAirport} ` +
        `has been cancelled.\n\n> Please check the Discord server for further announcements.`;
      await announceChannel.send(buildText(cancelNotice));
    }
  }
}

/**
 * Handle check-in timer firing.
 *
 * @param {object} timer
 * @param {import('discord.js').Client} client
 * @returns {Promise<void>}
 */
export async function handleCheckIn(timer, client) {
  const { flightId, flightNumber, spawnLocation, gateNumber, eventLink, privateServerLink } = timer.payload;

  // This timer was scheduled to delete an earlier check-in message, not to
  // open a new check-in. Previously this path fell through and re-posted an
  // announcement built entirely from `undefined`, then scheduled itself again
  // every 10 minutes forever.
  if (timer.payload?.action === "cleanup") {
    try {
      const channel = await client.channels.fetch(timer.payload.channelId);
      const message = await channel.messages.fetch(timer.payload.messageId).catch(() => null);
      if (message) await message.delete();
    } catch {
      // Message already gone, or we lack access. Nothing to do.
    }
    return;
  }

  // Post check-in announcement
  const announceChannel = await client.channels.fetch(config.flightAnnounceChannelId);
  if (announceChannel && announceChannel.isTextBased()) {
    const checkinMsg = `**${flightLabel(flightNumber)}** has started check-in!\n\n | **Spawn at ${spawnLocation}**, go to check in at gate ${gateNumber}\n\u2139 | People who violate the rules will be **kicked**!\n\n | ${eventLink}\n | ${privateServerLink}`;
    const sent = await announceChannel.send(buildText(checkinMsg));

    // Schedule deletion of this specific message after 10 minutes.
    if (sent?.id) {
      await createTimer({
        type: "flightCheckin",
        dueAt: new Date(Date.now() + 10 * 60 * 1000),
        guildId: config.guildIdMain,
        payload: {
          flightId,
          action: "cleanup",
          channelId: sent.channelId,
          messageId: sent.id,
        },
      });
    }
  }
}

export default { createFlight, logFlight, updateFlight, handleCheckIn };
