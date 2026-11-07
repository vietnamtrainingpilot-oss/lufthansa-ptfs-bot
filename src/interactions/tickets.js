/**
 * ticketInteractions.js — Interaction handlers for Tickets v2.
 */
import {
  createTicket,
  getTicketByChannelId,
  claimTicket,
  unclaimTicket,
  closeTicket,
} from "../services/tickets.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildConfirm, buildText } from "../utils/builders.js";

export async function handleTicketTypeSelect(interaction, client) {
  if (interaction.customId !== "ticket_type_select") return;
  const type = interaction.values[0];
  if (!type) return interaction.reply({ ...buildText("Invalid type."), ephemeral: true });

  await interaction.deferReply({ flags: 32768, ephemeral: true });
  try {
    const ticket = await createTicket(interaction.guild, interaction.user, type);
    const chLink = "<#" + ticket.channelId + ">";
    await interaction.editReply(buildText(" " + interaction.user + " Your ticket has been created at " + chLink + "."));
  } catch (e) {
    console.error("[tickets] createTicket failed:", e.message);
    await interaction.editReply(buildText("Failed: " + e.message));
  }
}

export async function handleTicketClaim(interaction, client) {
  if (interaction.customId !== "ticket_claim") return;
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!(await isStaffAuthorized(client, interaction.user.id, staffRoles))) {
    return interaction.reply({ ...buildText("Not authorized."), ephemeral: true });
  }
  const ticket = await getTicketByChannelId(interaction.channel.id);
  if (!ticket) return interaction.reply({ ...buildText("Ticket not found."), ephemeral: true });
  if (ticket.status === "closed") return interaction.reply({ ...buildText("Already closed."), ephemeral: true });
  try {
    await claimTicket(interaction.channel, ticket, interaction.user);
    await interaction.reply({ ...buildText("<@!" + interaction.user.id + "> claimed this ticket.") });
  } catch (e) {
    console.error("[tickets] claimTicket failed:", e.message);
    await interaction.reply({ ...buildText("Failed: " + e.message), ephemeral: true });
  }
}

export async function handleTicketUnclaim(interaction, client) {
  if (interaction.customId !== "ticket_unclaim") return;
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!(await isStaffAuthorized(client, interaction.user.id, staffRoles))) {
    return interaction.reply({ ...buildText("Not authorized."), ephemeral: true });
  }
  const ticket = await getTicketByChannelId(interaction.channel.id);
  if (!ticket) return interaction.reply({ ...buildText("Ticket not found."), ephemeral: true });
  try {
    await unclaimTicket(interaction.channel, ticket);
    await interaction.reply({ ...buildText("<@!" + interaction.user.id + "> has unclaimed this ticket.") });
  } catch (e) {
    console.error("[tickets] unclaimTicket failed:", e.message);
  }
}

export async function handleTicketClose(interaction, client) {
  if (interaction.customId !== "ticket_close") return;
  const ticket = await getTicketByChannelId(interaction.channel.id);
  if (!ticket) return interaction.reply({ ...buildText("Ticket not found."), ephemeral: true });
  if (interaction.user.id !== ticket.openerId && interaction.user.id !== ticket.claimerId) {
    return interaction.reply({ ...buildText("Only the opener or claimer can close."), ephemeral: true });
  }
  const confirmMsg = buildConfirm({
    title: "Closing confirmation",
    body: "Are you sure you want to close this ticket?",
    confirmCustomId: "ticket_close_confirm",
    cancelCustomId: "ticket_close_cancel",
  });
  await interaction.reply(confirmMsg);
}

export async function handleTicketCloseConfirm(interaction, client) {
  if (interaction.customId !== "ticket_close_confirm") return;
  const ticket = await getTicketByChannelId(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ ...buildText("Ticket not found."), ephemeral: true });
    return;
  }
  try {
    await closeTicket(interaction.channel, ticket, interaction.user, "Closed by requester", client);
    await interaction.reply({ ...buildText("Ticket has been closed."), ephemeral: true });
  } catch (e) {
    console.error("[tickets] closeTicket failed:", e.message);
    await interaction.reply({ ...buildText("Failed: " + e.message), ephemeral: true });
  }
}

export async function handleTicketCloseCancel(interaction, client) {
  if (interaction.customId !== "ticket_close_cancel") return;
  await interaction.reply({ ...buildText("Cancelled."), ephemeral: true });
}

export default {
  handleTicketTypeSelect,
  handleTicketClaim,
  handleTicketUnclaim,
  handleTicketClose,
  handleTicketCloseConfirm,
  handleTicketCloseCancel,
};
