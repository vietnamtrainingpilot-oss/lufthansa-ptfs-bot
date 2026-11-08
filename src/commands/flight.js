/**
 * /flight — Flight manifest and verified-reward operations (staff).
 *
 *   /flight manifest add       — add/update a passenger on the manifest
 *   /flight manifest presence  — mark present / no-show / removed
 *   /flight manifest finalize  — confirm the manifest
 *   /flight rewards-preview    — see who would be rewarded, and for how much
 *   /flight rewards-finalize   — apply the rewards (exactly once)
 *   /flight rewards-reconcile  — audited correction (compensating entries)
 */

import { SlashCommandBuilder } from "discord.js";
import { isFlightOpsAuthorized, isStaffAuthorized } from "../utils/permissions.js";
import { getDb } from "../services/firestore.js";
import * as manifestSvc from "../services/manifest.js";
import * as flightRewards from "../services/flightRewards.js";
import { getLoyaltyConfig } from "../services/loyaltyStore.js";
import { progressFromVerifiedFlight } from "../services/missions.js";
import { syncTier } from "../services/tiers.js";
import config from "../config/config.js";
import fmt from "../utils/loyaltyFormat.js";
import { buildText } from "../utils/builders.js";
import { flightLabel, ACCENT } from "../config/brand.js";

const STAFF_ROLES = () => [config.roleBoardOfDirectors, config.roleManagementTeam];

async function findFlight(query) {
  const db = getDb();
  const byNumber = await db.collection("flights").where("flightNumber", "==", query).limit(1).get();
  if (!byNumber.empty) return { id: byNumber.docs[0].id, ...byNumber.docs[0].data() };
  const byId = await db.collection("flights").doc(query).get();
  if (byId.exists) return { id: byId.id, ...byId.data() };
  return null;
}

async function requireFlightOps(interaction, client) {
  if (await isFlightOpsAuthorized(client, interaction.user.id)) return true;
  if (await isStaffAuthorized(client, interaction.user.id, STAFF_ROLES())) return true;
  await interaction.reply(fmt.resultMessage("Not authorised", "You do not have permission to run this command.", { ok: false }));
  return false;
}

export const data = new SlashCommandBuilder()
  .setName("flight")
  .setDescription("Flight manifest and reward operations")
  .addSubcommand((s) =>
    s.setName("manifest").setDescription("Manage a flight passenger manifest").addStringOption((o) =>
      o.setName("action").setDescription("Manifest action").setRequired(true).addChoices(
        { name: "Add or update passenger", value: "add" },
        { name: "Set presence", value: "presence" },
        { name: "Finalize manifest", value: "finalize" },
        { name: "View manifest", value: "view" }
      )
    )
    .addStringOption((o) => o.setName("flight").setDescription("Flight number or id").setRequired(true))
    .addUserOption((o) => o.setName("user").setDescription("Passenger"))
    .addStringOption((o) => o.setName("cabin").setDescription("Cabin class")
      .addChoices({ name: "Economy", value: "economy" }, { name: "Premium Economy", value: "premium" }, { name: "Business", value: "business" }))
    .addStringOption((o) => o.setName("seat").setDescription("Seat"))
    .addStringOption((o) => o.setName("bookingid").setDescription("Booking reference"))
    .addStringOption((o) => o.setName("presence").setDescription("Presence status")
      .addChoices(
        { name: "Present", value: "present" },
        { name: "No-show", value: "no_show" },
        { name: "Removed", value: "removed" }
      ))
    .addBooleanOption((o) => o.setName("ineligible").setDescription("Mark as ineligible for rewards"))
    .addStringOption((o) => o.setName("notes").setDescription("Staff notes"))
  )
  .addSubcommand((s) =>
    s.setName("rewards-preview").setDescription("Preview eligible passengers and proposed awards")
      .addStringOption((o) => o.setName("flight").setDescription("Flight number or id").setRequired(true))
  )
  .addSubcommand((s) =>
    s.setName("rewards-finalize").setDescription("Apply verified flight rewards")
      .addStringOption((o) => o.setName("flight").setDescription("Flight number or id").setRequired(true))
      .addBooleanOption((o) => o.setName("finalize").setDescription("Finalize the manifest automatically"))
  )
  .addSubcommand((s) =>
    s.setName("rewards-reconcile").setDescription("Audited correction for an applied reward")
      .addStringOption((o) => o.setName("flight").setDescription("Flight number or id").setRequired(true))
      .addUserOption((o) => o.setName("user").setDescription("Member to adjust").setRequired(true))
      .addIntegerOption((o) => o.setName("points").setDescription("Points adjustment (negative to reverse)").setRequired(true))
      .addIntegerOption((o) => o.setName("credits").setDescription("Credits adjustment (negative to reverse)").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason for the correction").setRequired(true))
  );

export async function execute(interaction, client) {
  const sub = interaction.options.getSubcommand();
  if (!(await requireFlightOps(interaction, client))) return;

  const flightQuery =
    sub === "manifest" ? interaction.options.getString("flight") : interaction.options.getString("flight");
  const flight = await findFlight(flightQuery);
  if (!flight) {
    return interaction.reply(fmt.resultMessage("Flight not found", `No flight matches "${flightQuery}".`, { ok: false }));
  }

  if (sub === "manifest") return handleManifest(interaction, flight);
  if (sub === "rewards-preview") return handlePreview(interaction, flight);
  if (sub === "rewards-finalize") return handleFinalize(interaction, client, flight);
  if (sub === "rewards-reconcile") return handleReconcile(interaction, flight);
}

async function handleManifest(interaction, flight) {
  const action = interaction.options.getString("action");
  await manifestSvc.ensureManifest(flight.id, {
    flightNumber: flight.flightNumber,
    departure: flight.departureAirport,
    arrival: flight.arrivalAirport,
  });

  if (action === "view") {
    const man = await manifestSvc.getManifest(flight.id);
    const cfg = await getLoyaltyConfig();
    const summary = manifestSvc.summariseEligible(man, cfg);
    const out = [`## Manifest: ${flight.flightNumber}`, `> ${flight.departureAirport} to ${flight.arrivalAirport}`, ""];
    if (!man?.passengers?.length) {
      out.push("No passengers on the manifest yet.");
    } else {
      for (const p of man.passengers) {
        const status = p.presenceStatus;
        const marks = [status, p.cabinClass, p.seat].filter(Boolean).join(" | ");
        out.push(`<@!${p.userId}> — ${marks}${p.eligible === false ? " | INELIGIBLE" : ""}`);
      }
    }
    out.push("");
    out.push(`Eligible for rewards: **${summary.eligibleCount}** of ${summary.totalPassengers}`);
    out.push(`Manifest finalized: **${man?.finalized ? "yes" : "no"}**`);
    out.push(`Rewards applied: **${man?.rewardsApplied ? "yes" : "no"}**`);
    return interaction.reply(fmt.lines(out, { accentColor: ACCENT.DEFAULT }));
  }

  const user = interaction.options.getUser("user");
  if (!user) {
    return interaction.reply(fmt.resultMessage("Missing member", "A user option is required for this action.", { ok: false }));
  }

  if (action === "add") {
    const cabin = interaction.options.getString("cabin") || "economy";
    const rec = await manifestSvc.upsertPassenger(flight.id, {
      userId: user.id,
      displayName: user.tag,
      cabinClass: cabin,
      seat: interaction.options.getString("seat"),
      bookingId: interaction.options.getString("bookingid"),
      presenceStatus: interaction.options.getString("presence") || manifestSvc.PRESENCE.UNMARKED,
      eligible: interaction.options.getBoolean("ineligible") === false,
      notes: interaction.options.getString("notes"),
      markedById: interaction.user.id,
    });
    return interaction.reply(
      fmt.resultMessage("Passenger recorded", `<@!${user.id}> added to the manifest as ${rec.cabinClass}, presence ${rec.presenceStatus}.`)
    );
  }

  if (action === "presence") {
    const presence = interaction.options.getString("presence");
    if (!presence) {
      return interaction.reply(fmt.resultMessage("Missing presence", "Choose a presence status.", { ok: false }));
    }
    const rec = await manifestSvc.setPresence(flight.id, user.id, presence, {
      eligible: interaction.options.getBoolean("ineligible"),
      markedById: interaction.user.id,
      notes: interaction.options.getString("notes"),
    });
    if (!rec) {
      return interaction.reply(fmt.resultMessage("Not on manifest", "That member is not on this flight manifest.", { ok: false }));
    }
    return interaction.reply(
      fmt.resultMessage("Presence updated", `<@!${user.id}> is now marked ${presence}.`)
    );
  }

  if (action === "finalize") {
    const man = await manifestSvc.getManifest(flight.id);
    if (!man?.passengers?.length) {
      return interaction.reply(fmt.resultMessage("Nothing to finalize", "The manifest has no passengers.", { ok: false }));
    }
    await manifestSvc.finalizeManifest(flight.id, interaction.user.id);
    const cfg = await getLoyaltyConfig();
    const summary = manifestSvc.summariseEligible(man, cfg);
    return interaction.reply(
      fmt.resultMessage(
        "Manifest finalized",
        `${summary.eligibleCount} of ${summary.totalPassengers} passengers are eligible for rewards. Run /flight rewards-preview to review before awarding.`
      )
    );
  }
}

async function handlePreview(interaction, flight) {
  const preview = await flightRewards.buildRewardPreview(flight);
  if (!preview.ok) {
    return interaction.reply(fmt.resultMessage("Preview unavailable", preview.message, { ok: false }));
  }
  const b = preview.branding;
  const out = [
    `## Reward preview: ${flightLabel(preview.flightNumber)}`,
    `> Route: ${preview.route}`,
    `> Manifest finalized: ${preview.finalized ? "yes" : "no"}`,
    `> Passengers: ${preview.totalPassengers} | Eligible: ${preview.eligibleCount} | Excluded: ${preview.excludedCount}`,
    "",
  ];
  if (!preview.awarded.length) {
    out.push("No eligible passengers yet. Mark passengers present and finalize the manifest.");
  }
  for (const a of preview.awarded.slice(0, 15)) {
    out.push(`<@!${a.userId}> — ${a.points} ${b.pointsUnit}, ${a.credits} ${b.creditsUnit} (${a.cabinClass})`);
    out.push(`> ${fmt.safeText(a.explanation.summary, 120)}`);
  }
  if (preview.awarded.length > 15) {
    out.push(`…and ${preview.awarded.length - 15} more.`);
  }
  if (preview.capApplied) out.push("Per-flight cap applied.");
  out.push("");
  out.push(`Totals: **${fmt.num(preview.totalPoints)} ${b.pointsUnit}**, **${fmt.num(preview.totalCredits)} ${b.creditsUnit}**`);
  out.push("Use /flight rewards-finalize to apply.");
  return interaction.reply(fmt.lines(out, { accentColor: ACCENT.DEFAULT }));
}

async function handleFinalize(interaction, client, flight) {
  if (flight.status !== "completed") {
    return interaction.reply(
      fmt.resultMessage(
        "Flight not completed",
        `This flight has status "${flight.status}". Complete it with /logflight before awarding rewards.`,
        { ok: false }
      )
    );
  }

  const autoFinalize = interaction.options.getBoolean("finalize") === true;
  const result = await flightRewards.awardFlightRewards(flight, interaction.user.id, { autoFinalize });

  if (!result.applied) {
    return interaction.reply(fmt.resultMessage("Rewards not applied", result.message || result.reason, { ok: false }));
  }

  // Advance missions from the verified event.
  const missionsTouched = [];
  for (const r of result.results) {
    if (!r.pointsApplied) continue;
    try {
      const adv = await progressFromVerifiedFlight({ userId: r.userId, flight });
      if (adv.length) missionsTouched.push({ userId: r.userId, missions: adv });
      await syncTier(r.userId, await getLoyaltyConfig(), client);
    } catch (e) {
      console.error("[flight] mission/tier sync failed:", e.message);
    }
  }

  // DM each rewarded member a plain-language explanation.
  const cfg = await getLoyaltyConfig();
  const preview = result.preview;
  for (const entry of preview.awarded) {
    try {
      const u = await client.users.fetch(entry.userId);
      await u.send(buildText(
        `Flight completed: ${flightLabel(flight.flightNumber)}, ${flight.departureAirport} to ${flight.arrivalAirport}. ` +
        `You earned ${entry.points} ${cfg.branding.pointsUnit} and ${entry.credits} ${cfg.branding.creditsUnit}.\n` +
        `${entry.explanation.detail}`
      ));
    } catch (e) {
      // DMs may be closed; not fatal.
    }
  }

  // Staff summary in the flight log channel.
  try {
    const ch = await client.channels.fetch(config.flightLogChannelId);
    if (ch?.isTextBased()) {
      await ch.send(buildText(
        `## Flight rewards applied: ${flightLabel(flight.flightNumber)}\n` +
        `Route: ${flight.departureAirport} to ${flight.arrivalAirport}\n` +
        `Rewarded: ${result.totals.rewardedPassengers} passengers\n` +
        `Totals: ${result.totals.totalPoints} points, ${result.totals.totalCredits} credits\n` +
        `Skipped (data issues): ${result.totals.skippedCount}`
      ));
    }
  } catch (e) {
    console.error("[flight] Failed to post rewards summary:", e.message);
  }

  return interaction.reply(
    fmt.resultMessage(
      "Rewards applied",
      `${result.totals.rewardedPassengers} passengers rewarded. Totals: ${result.totals.totalPoints} points and ${result.totals.totalCredits} credits.` +
        (missionsTouched.length ? ` ${missionsTouched.reduce((s, m) => s + m.missions.length, 0)} mission progress updates recorded.` : "")
    )
  );
}

async function handleReconcile(interaction, flight) {
  const target = interaction.options.getUser("user");
  const pointsDelta = interaction.options.getInteger("points") || 0;
  const creditsDelta = interaction.options.getInteger("credits") || 0;
  const reason = interaction.options.getString("reason");

  if (pointsDelta === 0 && creditsDelta === 0) {
    return interaction.reply(fmt.resultMessage("Nothing to do", "Provide a non-zero points or credits adjustment.", { ok: false }));
  }

  try {
    const res = await flightRewards.reconcileFlight(flight, target.id, interaction.user.id, {
      pointsDelta,
      creditsDelta,
      reason,
    });
    return interaction.reply(
      fmt.resultMessage(
        "Reconciliation recorded",
        `<@!${target.id}> adjusted by ${pointsDelta} points and ${creditsDelta} credits. Compensating ledger entries written.`
      )
    );
  } catch (e) {
    return interaction.reply(fmt.resultMessage("Reconciliation failed", e.message, { ok: false }));
  }
}

export default { data, execute };
