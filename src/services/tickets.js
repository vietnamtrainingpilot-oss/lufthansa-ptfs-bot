/**
 * tickets.js — Tickets v2 service.
 * Handles ticket creation, claim/unclaim/close, transcript generation, and quota logging.
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";

import config from "../config/config.js";
import { buildText } from "../utils/builders.js";

const COLLECTION = "tickets";

const TYPE_PREFIXES = {
  general: "generalsupport",
  partnership: "partner",
  fastpass: "fastpass",
  report: "report",
  other: "other",
};

const TYPE_NAMES = {
  general: "General Support",
  partnership: "Partnership Inquiry",
  fastpass: "Fast Pass",
  report: "Report",
  other: "Other",
};

/** Body text for each ticket type (starter message). */
const TYPE_BODY_TEXT = {
  general: "Thank you for contacting Lufthansa PTFS Support. Please state your support after creating the ticket. We will soon come and analyze and give you the perfect support. Thank you.",
  report: "Thank you for reporting this issue. Please describe what you're reporting in detail below. Our staff will investigate promptly.",
  other: "Thank you for reaching out to Lufthansa PTFS. Please describe your enquiry below and our staff will assist you.",
  partnership: `Thank you for your interest in partnering with us. Please fill out the form via the format given below. We will soon analyze and discuss the partnership. Thank you.`,
  fastpass: `Thank you for your interest in joining into the staff team via direct entry. Please fill out the form below via the format so we can analyze and give out the exact role matches your experience. Thank you.`,
};

/**
 * Build the starter message content string for a ticket type.
 *
 * @param {string} type
 * @param {string} username
 * @returns {string}
 */
export function buildStarterMessageContent(type, username) {
  const body = TYPE_BODY_TEXT[type] || TYPE_BODY_TEXT.general;
  const codeBlock =
    type === "partnership"
      ? `Name: / Server/Airline: / Current Membercount (does not include bots): / Reputation within the community: / Number of raids occurred in the server: / Notes:`
      : type === "fastpass"
        ? `Name: / User ID: / Fast-pass wanted roles: / Previous positions (in other servers) / Server previous employment link: / Employment Time: / Attachments:`
        : null;
  if (codeBlock) {
    return "### " + username + " ticket\n> " + body + "\n```\n" + codeBlock + "\n```";
  }
  return "### " + username + " ticket\n> " + body;
}

/**
 * Create a new ticket channel and Firestore record.
 *
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').User} opener
 * @param {string} type
 * @returns {Promise<object>} ticket record
 */
export async function createTicket(guild, opener, type) {
  const prefix = TYPE_PREFIXES[type] || "other";
  const cleanUsername = opener.username.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const channelName = prefix + "-" + cleanUsername;

  // Permission overwrites applied in order per spec:
  // 1. Deny ViewChannel for @everyone
  // 2. Allow ViewChannel+SendMessages for opener
  // 3. Allow ViewChannel+SendMessages for ticket-view roles
  const everyoneRole = guild.roles.everyone;
  const overwrites = [
    { id: everyoneRole.id, type: "role", deny: ["ViewChannel"] },
    { id: opener.id, type: "member", allow: ["ViewChannel", "SendMessages"] },
  ];

for (const roleId of config.ticketViewRoleIds) {
    overwrites.push({
      id: roleId,
      type: "role",
      allow: ["ViewChannel", "SendMessages"],
    });
  }

  // Blocked roles must be denied at creation time too, not only on a later
  // rebuild. Deny is applied after the allow entries because Discord resolves
  // conflicting role overwrites with deny winning.
  for (const roleId of config.ticketBlockedRoleIds || []) {
    overwrites.push({
      id: roleId,
      type: "role",
      deny: ["ViewChannel"],
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: 0,
    parent: config.ticketsCategoryId,
    permissionOverwrites: overwrites,
  });

  const db = getDb();
  const ticketId = db.collection(COLLECTION).doc().id;
  const ticketData = {
    id: ticketId,
    type,
    openerId: opener.id,
    claimerId: null,
    status: "open",
    channelId: channel.id,
    createdAt: new Date(),
    closedAt: null,
    closedById: null,
    transcriptMessageId: null,
    staffMessageAuthorIds: [],
    messageLog: [],
  };
await db.collection(COLLECTION).doc(ticketId).set(ticketData);

  // Post the starter message. Without it the new channel is completely empty:
  // nobody sees the Claim / Unclaim / Close buttons, so those handlers are
  // unreachable through the UI.
  try {
    const { buildStarterMessage } = await import("../utils/ticketMessages.js");
    await channel.send(buildStarterMessage(type, opener.toString()));
  } catch (e) {
    // Never fail ticket creation just because the greeting could not post.
    console.error("[tickets] Could not post starter message:", e.message);
  }

  return ticketData;
}

/**
 * Get a ticket by channel ID.
 */
export async function getTicketByChannelId(channelId) {
  const db = getDb();
  const snap = await db
    .collection(COLLECTION)
    .where("channelId", "==", channelId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Get a ticket by ID.
 */
export async function getTicket(ticketId) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(ticketId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

/**
 * Update a ticket's fields.
 */
export async function updateTicket(ticketId, updates) {
  const db = getDb();
  await db.collection(COLLECTION).doc(ticketId).update(updates);
}

/**
 * Rebuild ticket channel permissions from a ticket record.
 * Always re-applies blocked-role denies; member overwrites take precedence.
 *
 * @param {import('discord.js').TextChannel} channel
 * @param {object} ticket
 * @param {string[]} extraAllowedUserIds
 */
export async function rebuildTicketPermissions(channel, ticket, extraAllowedUserIds = []) {
  const everyoneRole = channel.guild.roles.everyone;
  const overwrites = [
    { id: everyoneRole.id, type: "role", deny: ["ViewChannel"] },
    { id: ticket.openerId, type: "member", allow: ["ViewChannel", "SendMessages"] },
  ];

  for (const userId of extraAllowedUserIds) {
    overwrites.push({
      id: userId,
      type: "member",
      allow: ["ViewChannel", "SendMessages"],
    });
  }

  for (const roleId of config.ticketViewRoleIds) {
    overwrites.push({
      id: roleId,
      type: "role",
      allow: ["ViewChannel", "SendMessages"],
    });
  }

  // Blocked roles are denied AFTER the view roles are granted, because Discord
  // resolves conflicting role overwrites with deny winning over allow. This must
  // be re-applied on every rebuild; a full permission-set rewrite would
  // otherwise silently drop the block.
  for (const roleId of config.ticketBlockedRoleIds || []) {
    overwrites.push({
      id: roleId,
      type: "role",
      deny: ["ViewChannel"],
    });
  }

  await channel.permissionOverwrites.set(overwrites);
}

/**
 * Claim a ticket: assign claimer, restrict to opener+claimer, log staff participation.
 */
export async function claimTicket(channel, ticket, claimer) {
  const db = getDb();
  await db.collection(COLLECTION).doc(ticket.id).update({
    claimerId: claimer.id,
    status: "claimed",
  });
  await rebuildTicketPermissions(channel, ticket, [claimer.id]);
}

/**
 * Unclaim a ticket: clear claimer, restore default visibility.
 */
export async function unclaimTicket(channel, ticket) {
  const db = getDb();
  await db.collection(COLLECTION).doc(ticket.id).update({
    claimerId: null,
    status: "open",
  });
  await rebuildTicketPermissions(channel, ticket, []);
}

/**
 * Close a ticket: generate transcript, log quota, DM opener, delete channel.
 *
 * @param {import('discord.js').TextChannel} channel
 * @param {object} ticket
 * @param {import('discord.js').User} closer
 * @param {string} reason
 * @param {import('discord.js').Client} client
 * @returns {Promise<void>}
 */
export async function closeTicket(channel, ticket, closer, reason, client) {
  const db = getDb();
  const closerId = closer.id;

  // Generate transcript
  let transcriptMsgId = null;
  try {
    const { createTranscript } = await import("discord-html-transcripts");
    const transcript = await createTranscript(channel);
    const logChannel = await client.channels.fetch(config.ticketsLogChannelId);
    if (logChannel) {
      await logChannel.send({
        files: [{ attachment: transcript, name: `ticket-${ticket.id}-transcript.html` }],
      });
      const msg = await logChannel.messages.fetch(logChannel.messages.cache.last()?.id);
      transcriptMsgId = msg?.id || null;
    }
  } catch (e) {
    console.error("[tickets] Transcript generation failed:", e.message);
  }

  // Log quota entry
  try {
    const logChannel = await client.channels.fetch(config.ticketsLogChannelId);
    if (logChannel && logChannel.isTextBased()) {
      const claimerTag = ticket.claimerId
        ? client.users.cache.get(ticket.claimerId)?.tag || ticket.claimerId
        : "None";
      const openTag = client.users.cache.get(ticket.openerId)?.tag || ticket.openerId;
      const closerTag = closer.tag || String(closer);

      // Build interference list from logged staff message authors (excluding claimer)
      const interference = (ticket.staffMessageAuthorIds || [])
        .filter((uid) => uid !== ticket.claimerId)
        .map((uid) => (client.users.cache.get(uid)?.tag || uid))
        .join(", ") || "None";

      const quotaContent = `## ${TYPE_NAMES[ticket.type] || ticket.type} Ticket Closed
**Opener:** ${openTag}
**Claimed by:** ${claimerTag}
**Interference:** ${interference}
**Closed by:** ${closerTag}
**Reason:** ${reason || "No reason provided"}
**Ticket Number:** ${ticket.id}`;

      await logChannel.send(buildText(quotaContent));
    }
  } catch (e) {
    console.error("[tickets] Quota log failed:", e.message);
  }

  // DM the opener
  try {
    const opener = await client.users.fetch(ticket.openerId);
await opener.send(
      buildText(
        `Your ticket (${ticket.id}) has been closed. Reason: ${reason || "No reason provided"}. A transcript has been logged.`
      )
    );
  } catch (e) {
    // Opener may have DMs disabled — not fatal.
    console.log("[tickets] Could not DM opener:", e.message);
  }

  // Update Firestore
  await db.collection(COLLECTION).doc(ticket.id).update({
    status: "closed",
    closedAt: new Date(),
    closedById: closerId,
    transcriptMessageId: transcriptMsgId,
  });

  // Delete the channel
  try {
    await channel.delete();
  } catch (e) {
    console.error("[tickets] Failed to delete channel:", e.message);
  }
}

/**
 * Log a staff member sending a message in a ticket channel.
 *
 * @param {string} ticketId
 * @param {string} userId
 */
export async function logStaffMessage(ticketId, userId) {
  const db = getDb();
  const docRef = db.collection(COLLECTION).doc(ticketId);
  await docRef.update({
    staffMessageAuthorIds: admin.firestore.FieldValue.arrayUnion(userId),
  });
}

export default {
  createTicket,
  getTicketByChannelId,
  getTicket,
  updateTicket,
  rebuildTicketPermissions,
  claimTicket,
  unclaimTicket,
  closeTicket,
  logStaffMessage,
  buildStarterMessageContent,
  TYPE_PREFIXES,
  TYPE_NAMES,
};
