/**
 * ads.js — Paid advertising service.
 */
import { getDb } from "./firestore.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";

const COLLECTION = "adsOrders";

export const TIERS = [
  { id: "basic", name: "Basic", price: 45, duration: "1 day", pings: "None", embed: "No", placement: "Standard" },
  { id: "featured", name: "Featured", price: 125, duration: "2 days", pings: "1 (here)", embed: "Choice of a few", placement: "Priority over Basic" },
  { id: "premium", name: "Premium", price: 320, duration: "4 days", pings: "2 (here + engagement)", embed: "Fully custom", placement: "High-priority queue" },
  { id: "spotlight", name: "Spotlight", price: 600, duration: "7 days", pings: "2 (@everyone + choice)", embed: "Fully custom, pinned", placement: "Top priority" },
];

export async function purchaseAd(member, tierId, client) {
  const tier = TIERS.find((t) => t.id === tierId);
  if (!tier) throw new Error("Invalid tier: " + tierId);

  const db = getDb();
  const orderId = db.collection(COLLECTION).doc().id;

  // The partner role lives in the MAIN guild. `member` is the interaction
  // member of whichever guild the command fired in, so checking its role cache
  // for a Main-guild role id always returned false and the partner discount was
  // dead. Fetch the member from the Main guild instead.
  let isPartner = false;
  if (config.adsPartnerRoleId) {
    try {
      const mainGuild = await client.guilds.fetch(config.guildIdMain);
      const mainMember = await mainGuild.members.fetch(member.id).catch(() => null);
      isPartner = !!mainMember?.roles?.cache?.has(config.adsPartnerRoleId);
    } catch {
      isPartner = false;
    }
  }

  const orderData = {
    id: orderId,
    userId: member.id,
    tier: tierId,
    status: "pending_payment",
    ticketChannelId: null,
    createdAt: new Date(),
    partnerDiscountEligible: isPartner,
  };
  await db.collection(COLLECTION).doc(orderId).set(orderData);

  const ticket = await createTicket(member.guild, member.user, "other");
  await db.collection(COLLECTION).doc(orderId).update({ ticketChannelId: ticket.channelId });

  if (isPartner) {
    try {
      const ch = await client.channels.fetch(ticket.channelId);
      if (ch && ch.isTextBased()) {
        await ch.send(buildText(
          "> **Partner Discount Eligibility Detected**\n* <@&" + config.adsPartnerRoleId + "> holder — eligible for 5-10% discount. Staff to confirm manually."
        ));
      }
    } catch (e) {
      console.log("[ads] Could not post partner note:", e.message);
    }
  }

  try {
    await member.user.send(buildText(
      "Your " + tier.name + " ad order (" + orderId + ") has been created. A staff member will contact you via the ticket #" + ticket.channelId + " to arrange payment."
    ));
  } catch (e) {
    console.log("[ads] Could not DM user:", e.message);
  }

  return { ...orderData, id: orderId, ticket };
}

export default { TIERS, purchaseAd };
