/**
 * /rewards — Loyalty namespace.
 *
 * Existing subcommands preserved: profile, award, deduct, leaderboard, configure.
 * New subcommands added: history, catalogue, redeem, missions, mission-manage.
 */

import { SlashCommandBuilder } from "discord.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import { updateLoyaltyConfig } from "../services/loyaltyStore.js";
import { getLoyaltyConfig } from "../services/loyaltyStore.js";
import { TX_TYPE, applyLedgerEntry, writeAudit } from "../services/ledger.js";
import { CURRENCY } from "../config/loyaltyConfig.js";
import * as catalogue from "../services/catalogue.js";
import * as missions from "../services/missions.js";
import rewardsService from "../services/rewards.js";
import config from "../config/config.js";
import fmt from "../utils/loyaltyFormat.js";

const STAFF_ROLES = () => [config.roleBoardOfDirectors, config.roleManagementTeam];

export const data = new SlashCommandBuilder()
  .setName("rewards")
  .setDescription("VietJet Rewards loyalty programme")
  .addSubcommand((s) =>
    s
      .setName("profile")
      .setDescription("View a loyalty profile")
      .addUserOption((o) => o.setName("user").setDescription("Member to look up (defaults to you)"))
  )
  .addSubcommand((s) =>
    s.setName("history").setDescription("View transaction history").addUserOption((o) =>
      o.setName("user").setDescription("Member to look up (defaults to you)")
    )
    .addStringOption((o) =>
      o
        .setName("currency")
        .setDescription("Filter by currency")
        .addChoices({ name: "Loyalty points", value: "points" }, { name: "VJ Credits", value: "credits" })
    )
    .addIntegerOption((o) => o.setName("page").setDescription("Page number (default 1)"))
  )
  .addSubcommand((s) =>
    s.setName("leaderboard").setDescription("Top members by a metric").addStringOption((o) =>
      o
        .setName("metric")
        .setDescription("Metric to rank by")
        .addChoices(
          { name: "Current points", value: "points" },
          { name: "Lifetime points", value: "lifetimePoints" },
          { name: "Qualifying flights", value: "qualifyingFlights" },
          { name: "VJ Credits", value: "credits" }
        )
    )
  )
  .addSubcommand((s) => s.setName("catalogue").setDescription("Browse the loyalty catalogue"))
  .addSubcommand((s) => s.setName("missions").setDescription("View available missions and progress"))
  .addSubcommand((s) =>
    s
      .setName("award")
      .setDescription("Award loyalty points to a member (staff)")
      .addUserOption((o) => o.setName("user").setDescription("Member to adjust").setRequired(true))
      .addIntegerOption((o) => o.setName("amount").setDescription("Positive whole number").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason (recorded in the audit log)").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("deduct")
      .setDescription("Deduct loyalty points from a member (staff)")
      .addUserOption((o) => o.setName("user").setDescription("Member to adjust").setRequired(true))
      .addIntegerOption((o) => o.setName("amount").setDescription("Positive whole number").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason (recorded in the audit log)").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("configure")
      .setDescription("Update loyalty configuration (staff)")
      .addStringOption((o) => o.setName("set").setDescription("Configuration key to change").setRequired(true)
        .addChoices(
          { name: "pointsPer100km", value: "formula.pointsPer100km" },
          { name: "pointsPerMinuteFallback", value: "formula.pointsPerMinuteFallback" },
          { name: "minPointsPerFlight", value: "formula.minPointsPerFlight" },
          { name: "maxPointsPerFlight", value: "formula.maxPointsPerFlight" },
          { name: "tierBonusElite", value: "formula.tierBonus.elite" },
          { name: "tierBonusAdventurer", value: "formula.tierBonus.adventurer" },
          { name: "creditsPerHour", value: "creditsFormula.creditsPerHour" },
          { name: "minCreditsPerFlight", value: "creditsFormula.minCreditsPerFlight" },
          { name: "maxCreditsPerFlight", value: "creditsFormula.maxCreditsPerFlight" },
          { name: "adventurerThreshold", value: "tier.adventurerMin" },
          { name: "eliteThreshold", value: "tier.eliteMin" },
          { name: "pointsLabel", value: "branding.pointsLabel" },
          { name: "creditsLabel", value: "branding.creditsLabel" }
        ))
      .addNumberOption((o) => o.setName("value").setDescription("New value").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Why you are changing this").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("catalogue-manage")
      .setDescription("Create, update or disable a catalogue item (staff)")
      .addStringOption((o) => o.setName("action").setDescription("Catalogue action").setRequired(true)
        .addChoices({ name: "Add", value: "add" }, { name: "Disable", value: "disable" }, { name: "Enable", value: "enable" }))
      .addStringOption((o) => o.setName("itemid").setDescription("Item id (required for disable/enable)"))
      .addStringOption((o) => o.setName("name").setDescription("Display name (required for add)"))
      .addStringOption((o) => o.setName("description").setDescription("Description (required for add)"))
      .addStringOption((o) => o.setName("currency").setDescription("Currency type")
        .addChoices({ name: "Loyalty points", value: "points" }, { name: "VJ Credits", value: "credits" }))
      .addIntegerOption((o) => o.setName("price").setDescription("Price (required for add)"))
      .addIntegerOption((o) => o.setName("stock").setDescription("Stock, omit for unlimited"))
      .addStringOption((o) => o.setName("fulfillment").setDescription("How it is delivered")
        .addChoices({ name: "Instant", value: "instant" }, { name: "Staff queue", value: "staff_queue" }))
  )
  .addSubcommand((s) =>
    s
      .setName("mission-manage")
      .setDescription("Create, edit or disable a mission (staff)")
      .addStringOption((o) => o.setName("action").setDescription("Mission action").setRequired(true)
        .addChoices({ name: "Create", value: "create" }, { name: "Disable", value: "disable" }, { name: "Enable", value: "enable" }))
      .addStringOption((o) => o.setName("missionid").setDescription("Mission id (disable/enable)"))
      .addStringOption((o) => o.setName("title").setDescription("Mission title (create)"))
      .addStringOption((o) => o.setName("description").setDescription("Mission description (create)"))
      .addStringOption((o) => o.setName("objective").setDescription("Objective type (create)").setRequired(true)
        .addChoices(
          { name: "Flights this week", value: "flightsInPeriod:weekly" },
          { name: "Flights this month", value: "flightsInPeriod:monthly" },
          { name: "First time on a route", value: "firstTimeRoute" },
          { name: "Flights in a cabin class", value: "flightsInClass" },
          { name: "Flights to destinations", value: "flightsToDestinations" }
        ))
      .addStringOption((o) => o.setName("routekey").setDescription("Route key, e.g. HAN-DAD"))
      .addStringOption((o) => o.setName("cabin").setDescription("Cabin class")
        .addChoices({ name: "Economy", value: "economy" }, { name: "Premium", value: "premium" }, { name: "Business", value: "business" }))
      .addIntegerOption((o) => o.setName("target").setDescription("Target count (create, default 1)"))
      .addIntegerOption((o) => o.setName("reward").setDescription("Reward amount (create)").setRequired(true))
      .addStringOption((o) => o.setName("currency").setDescription("Reward currency")
        .addChoices({ name: "Loyalty points", value: "points" }, { name: "VJ Credits", value: "credits" }))
      .addStringOption((o) => o.setName("period").setDescription("Reset period (create)")
        .addChoices({ name: "Daily", value: "daily" }, { name: "Weekly", value: "weekly" }, { name: "Monthly", value: "monthly" }))
  );

export async function execute(interaction, client) {
  const sub = interaction.options.getSubcommand();
  const loyaltyCfg = await getLoyaltyConfig();

  switch (sub) {
    case "profile": {
      const target = interaction.options.getUser("user") || interaction.user;
      const profile = await rewardsService.getMemberProfile(target.id);
      const isSelf = target.id === interaction.user.id;
      return interaction.reply(isSelf ? fmt.profileMessage(profile) : fmt.publicProfileMessage(profile));
    }

    case "history": {
      const target = interaction.options.getUser("user") || interaction.user;
      const currency = interaction.options.getString("currency");
      const page = Math.max(1, interaction.options.getInteger("page") || 1);
      const perPage = 10;
      const all = await rewardsService.getMemberHistory(target.id, { limit: 100, currency });
      const pageCount = Math.max(1, Math.ceil(all.length / perPage));
      const slice = all.slice((page - 1) * perPage, page * perPage);
      return interaction.reply(fmt.historyMessage(slice, { page, pageCount, branding: loyaltyCfg.branding, currency }));
    }

    case "leaderboard": {
      const metric = interaction.options.getString("metric") || "points";
      const rows = await rewardsService.getLeaderboard(metric, 10);
      const labels = {
        points: "Current loyalty points",
        lifetimePoints: "Lifetime points earned",
        qualifyingFlights: "Qualifying flights completed",
        credits: "VJ Credits",
      };
      return interaction.reply(fmt.leaderboardMessage(rows, labels[metric], loyaltyCfg.branding));
    }

    case "catalogue": {
      const items = await catalogue.listItems({ currency: CURRENCY.POINTS });
      return interaction.reply(
        fmt.catalogueMessage(items, {
          title: `${loyaltyCfg.branding.pointsLabel} catalogue`,
          branding: loyaltyCfg.branding,
          actionPrefix: "redeem_confirm",
        })
      );
    }

    case "missions": {
      const list = await missions.getMemberMissions(interaction.user.id);
      return interaction.reply(fmt.missionsMessage(list, loyaltyCfg.branding));
    }

    /* -- Staff-only -------------------------------------------------------- */

    case "award":
    case "deduct": {
      if (!(await isStaffAuthorized(client, interaction.user.id, STAFF_ROLES()))) {
        return interaction.reply(fmt.resultMessage("Not authorised", "This command is staff-only.", { ok: false }));
      }
      const amount = interaction.options.getInteger("amount");
      if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
        return interaction.reply(
          fmt.resultMessage("Invalid amount", "Amount must be a positive whole number no greater than 1,000,000.", { ok: false })
        );
      }
      const target = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");

      const result = await rewardsService[sub === "award" ? "awardPoints" : "deductPoints"](
        target.id, amount, reason, interaction.user.id
      );
      if (result.duplicate) {
        return interaction.reply(fmt.resultMessage("Already applied", "That request was already processed."));
      }

      await postRewardsLog(client, sub, target.id, sub === "award" ? amount : -amount, reason, interaction.user.id);
      return interaction.reply(
        fmt.resultMessage(
          sub === "award" ? "Points awarded" : "Points deducted",
          `<@!${target.id}> ${sub === "award" ? "+" : ""}${sub === "award" ? amount : -amount} points. New balance: ${fmt.num(result.balance)}.`
        )
      );
    }

    case "configure": {
      if (!(await isStaffAuthorized(client, interaction.user.id, STAFF_ROLES()))) {
        return interaction.reply(fmt.resultMessage("Not authorised", "This command is staff-only.", { ok: false }));
      }
      const path = interaction.options.getString("set");
      const value = interaction.options.getNumber("value");
      const reason = interaction.options.getString("reason");

      const patch = {};
      if (path.startsWith("tier.")) {
        const tierKey = path.split(".")[1].replace("Min", "").toLowerCase();
        const tiers = loyaltyCfg.tiers.list.map((t) =>
          t.key === tierKey ? { ...t, min: Math.max(0, Math.floor(value)) } : t
        );
        tiers.sort((a, b) => a.min - b.min);
        if (tiers[0].min !== 0) {
          return interaction.reply(fmt.resultMessage("Invalid", "The first tier must stay at 0.", { ok: false }));
        }
        patch.tiers = { ...loyaltyCfg.tiers, list: tiers };
      } else {
        setDeep(patch, path, value);
      }

      try {
        const updated = await updateLoyaltyConfig(patch, interaction.user.id, reason);
        return interaction.reply(
          fmt.resultMessage("Configuration updated", `${path} is now ${JSON.stringify(getDeep(updated, path))}.`)
        );
      } catch (e) {
        return interaction.reply(fmt.resultMessage("Configuration rejected", e.message, { ok: false }));
      }
    }

    case "catalogue-manage": {
      if (!(await isStaffAuthorized(client, interaction.user.id, STAFF_ROLES()))) {
        return interaction.reply(fmt.resultMessage("Not authorised", "This command is staff-only.", { ok: false }));
      }
      const action = interaction.options.getString("action");
      const itemId = interaction.options.getString("itemid");

      if (action === "add") {
        const name = interaction.options.getString("name");
        const description = interaction.options.getString("description");
        const currency = interaction.options.getString("currency") || CURRENCY.POINTS;
        const price = interaction.options.getInteger("price");
        const stock = interaction.options.getInteger("stock");
        const fulfillment = interaction.options.getString("fulfillment") || catalogue.FULFILMENT.STAFF_QUEUE;

        if (!name || !description || price === null) {
          return interaction.reply(
            fmt.resultMessage("Missing fields", "name, description and price are required to add an item.", { ok: false })
          );
        }
        if (price <= 0) {
          return interaction.reply(fmt.resultMessage("Invalid price", "Price must be greater than zero.", { ok: false }));
        }
        const doc = await catalogue.upsertItem({ displayName: name, description, currency, price, stock, fulfillment }, interaction.user.id);
        return interaction.reply(fmt.resultMessage("Item added", `\`${doc.id}\` ${doc.displayName} at ${doc.price} ${doc.currency}.`));
      }

      if (!itemId) {
        return interaction.reply(fmt.resultMessage("Missing item id", "itemid is required for enable/disable.", { ok: false }));
      }
      const item = await catalogue.getItem(itemId);
      if (!item) return interaction.reply(fmt.resultMessage("Not found", "No such catalogue item.", { ok: false }));

      const db = (await import("../services/firestore.js")).getDb();
      await db.collection("catalogueItems").doc(itemId).set({ active: action === "enable" }, { merge: true });
      await writeAudit({
        actorId: interaction.user.id,
        action: `catalogue_${action}`,
        reason: `Item ${itemId} ${action}d`,
        before: { active: item.active },
        after: { active: action === "enable" },
        referenceType: "catalogueItem",
        referenceId: itemId,
      });
      return interaction.reply(fmt.resultMessage(`Item ${action}d`, `${item.displayName} is now ${action === "enable" ? "active" : "disabled"}.`));
    }

    case "mission-manage": {
      if (!(await isStaffAuthorized(client, interaction.user.id, STAFF_ROLES()))) {
        return interaction.reply(fmt.resultMessage("Not authorised", "This command is staff-only.", { ok: false }));
      }
      const action = interaction.options.getString("action");
      const missionId = interaction.options.getString("missionid");

      if (action === "create") {
        const title = interaction.options.getString("title");
        const rawObjective = interaction.options.getString("objective");
        const reward = interaction.options.getInteger("reward");
        if (!title || !rawObjective || reward === null || reward <= 0) {
          return interaction.reply(
            fmt.resultMessage("Missing fields", "title, objective and a positive reward are required.", { ok: false })
          );
        }
        // Objective values may carry an embedded period, e.g. "flightsInPeriod:weekly".
        const [objective, embeddedPeriod] = rawObjective.split(":");
        const period = interaction.options.getString("period") || embeddedPeriod || null;
        const doc = await missions.upsertMission(
          {
            title,
            description: interaction.options.getString("description") || "",
            objective,
            target: interaction.options.getInteger("target") || 1,
            period,
            routeKey: interaction.options.getString("routekey"),
            cabinClass: interaction.options.getString("cabin"),
            rewardCurrency: interaction.options.getString("currency") || CURRENCY.POINTS,
            rewardAmount: reward,
          },
          interaction.user.id
        );
        return interaction.reply(fmt.resultMessage("Mission created", `\`${doc.id}\` ${doc.title}.`));
      }

      if (!missionId) {
        return interaction.reply(fmt.resultMessage("Missing mission id", "missionid is required for enable/disable.", { ok: false }));
      }
      const res = await missions.setMissionEnabled(
        missionId, action === "enable", interaction.user.id, `Mission ${action}d by staff`
      );
      return interaction.reply(fmt.resultMessage(`Mission ${action}d`, `Mission ${missionId} updated.`));
    }

    default:
      return interaction.reply(fmt.resultMessage("Unknown subcommand", "That subcommand is not available.", { ok: false }));
  }
}

async function postRewardsLog(client, action, targetId, amount, reason, staffId) {
  try {
    const ch = await client.channels.fetch(config.rewardsLogChannelId);
    if (!ch?.isTextBased()) return;
    await ch.send({
      flags: 32768,
      components: [
        {
          type: 17,
          accent_color: 0x70a1ff,
          components: [
            {
              type: 10,
              content: `## Loyalty ${action}\n**Member:** <@!${targetId}>\n**Amount:** ${amount >= 0 ? "+" : ""}${amount} points\n**Reason:** ${fmt.safeText(reason, 200)}\n**Staff:** <@!${staffId}>`,
            },
          ],
        },
      ],
    });
  } catch (e) {
    console.error("[rewards] Failed to post rewards log:", e.message);
  }
}

function setDeep(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = cur[parts[i]] || {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function getDeep(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
