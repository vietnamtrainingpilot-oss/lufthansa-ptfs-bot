/**
 * ticketMessages.js — message builders for the Tickets v2 system.
 * All messages use Components V2 (flags: 32768).
 */

import { buildMessage, buildText, ACCENT_TICKET } from "./builders.js";
import { buildStarterMessageContent } from "../services/tickets.js";
import config from "../config/config.js";

/**
 * Build the opener's ephemeral notification after ticket creation.
 */
export function buildTicketCreatedNotification(channel) {
  return buildText(`Your ticket has been created at ${channel}`.trim());
}

/**
 * Build the starter message for a new ticket channel.
 * Uses a single parametrized template; Report and Other reuse General Support copy with type swapped.
 */
export function buildStarterMessage(type, opener) {
  const bodyText = buildStarterMessageContent(type, opener.username);
  const ping = config.staffPingRoleId ? ` <@&${config.staffPingRoleId}>` : "";
  const content = opener + ping;
  return buildMessage({
    accentColor: ACCENT_TICKET,
    text: [content, bodyText],
    buttons: [
      { label: "Claim", style: 3, customId: "ticket_claim" },
      { label: "Unclaim", style: 2, customId: "ticket_unclaim" },
      { label: "Close", style: 4, customId: "ticket_close" },
    ],
  });
}

/**
 * Build the close confirmation message (buttons, not just text).
 */
export function buildCloseConfirmation(ticket, closer) {
  return buildMessage({
    accentColor: ACCENT_TICKET,
    text: ["### Closing confirmation", "> Are you sure you want to close this ticket?", closer + ""],
    buttons: [
      { label: "Confirm Close", style: 4, customId: "ticket_close_confirm" },
      { label: "Cancel", style: 2, customId: "ticket_close_cancel" },
    ],
  });
}

export default { buildTicketCreatedNotification, buildStarterMessage, buildCloseConfirmation };
