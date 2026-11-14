/**
 * /setup — Unified administrator onboarding & configuration wizard.
 *
 * Replaces: /setup earning, /setup daily, /setup log-channel, /setup staff-role, /setup view, /setup wizard
 */
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { getDb } from "../services/firestore.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText, buildMessage } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

const WIZARD_SESSIONS = new Map(); // guildId -> wizardState
const SECTIONS = ["identity", "membership", "earning", "flights", "permissions", "rewards", "daily", "events", "premium", "review"];
const SECTION_NAMES = {
  identity: "Airline Identity",
  membership: "Membership Tiers",
  earning: "Earning Rules",
  flights: "Flight Settings",
  permissions: "Permissions",
  rewards: "Rewards Shop",
  daily: "Daily Rewards",
  events: "Events & Alliances",
  premium: "Premium Features",
  review: "Review & Activate",
};
const SECTION_DESC = {
  identity: "Configure your airline display name, programme branding, logo, colors and footer.",
  membership: "Set qualification thresholds, Discord roles, and tier benefits.",
  earning: "Choose distance or flat earning mode and configure cabin multipliers.",
  flights: "Configure claim deadlines, announcement channels, and staff permissions.",
  permissions: "Assign admin and staff roles, set audit logging channel.",
  rewards: "Enable/disable the rewards shop and configure redemption rules.",
  daily: "Activate daily check-ins, set base reward and streak bonuses.",
  events: "Configure event permissions and alliance settings.",
  premium: "Review available Premium features and current entitlement status.",
  review: "Review all settings before activating the Miles & More system.",
};

const DEFAULT_WIZARD_STATE = {
  section: 0,
  completed: false,
  data: {
    identity: {},
    membership: {},
    earning: { mode: "distance", flatMiles: 1500 },
    flights: {},
    permissions: {},
    rewards: { enabled: true },
    daily: { enabled: true, baseMiles: 100, streakBonus: 50 },
    events: { enabled: true },
    alliances: { enabled: true },
    premium: {},
  },
};

export const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Configure Miles & More (admin)");

async function getWizardState(guildId) {
  if (!WIZARD_SESSIONS.has(guildId)) {
    WIZARD_SESSIONS.set(guildId, { ...DEFAULT_WIZARD_STATE });
  }
  return WIZARD_SESSIONS.get(guildId);
}

async function saveToFirestore(state) {
  const db = getDb();
  await db.collection("config").doc("mileageSetup").set({ ...state.data, completed: state.completed, updatedAt: new Date() });
}

function buildSectionEmbed(sectionIdx, state) {
  const section = SECTIONS[sectionIdx];
  const d = state.data[section] || {};
  const lines = [
    `**${SECTION_NAMES[section]}**`,
    `*${SECTION_DESC[section]}*`,
    "",
    `Progress: ${sectionIdx + 1}/${SECTIONS.length}`,
    "",
  ];

  switch (section) {
    case "identity":
      lines.push(
        `Airline Name: ${d.airlineName || "(not set)"}`,
        `Programme Name: ${d.programmeName || "LH Rewards"}`,
        `Primary Color: ${d.primaryColor || "#FFAD00"}`,
        `Logo URL: ${d.logoUrl || "(none)"}`,
        `Footer: ${d.footer ? d.footer.slice(0, 60) + "..." : "(default)"}`
      );
      break;
    case "membership":
      lines.push(
        `Frequent Traveller: ${d.ftStatusPoints || 650} SP / ${d.ftQualifyingPoints || 325} QP`,
        `Senator: ${d.senatorStatusPoints || 2000} SP / ${d.senatorQualifyingPoints || 1000} QP`,
        `HON Circle: ${d.honCircleStatusPoints || 6000} SP / ${d.honCircleHonPoints || 6000} HP`
      );
      break;
    case "earning":
      lines.push(
        `Mode: ${d.mode || "distance"}`,
        d.mode === "flat" ? `Flat Base: ${d.flatMiles || 1500} miles` : "Distance rate per 100km applied per cabin",
        `Cabin Multipliers: economy=${d.economyMult || 1.0}x, business=${d.businessMult || 2.5}x, first=${d.firstMult || 4.0}x`
      );
      break;
    case "flights":
      lines.push(
        `Claim Deadline: ${d.defaultClaimMinutes || 10080} minutes`,
        `Announce Channel: ${d.announceChannel ? `<#${d.announceChannel}>` : "(default)"}`
      );
      break;
    case "permissions":
      lines.push(
        `Staff Role: ${d.staffRole ? `<@&${d.staffRole}>` : "(not set)"}`,
        `Admin Roles: ${d.adminRoles?.length ? d.adminRoles.map(r => `<@&${r}>`).join(", ") : "(defaults)"}`
      );
      break;
    case "rewards":
      lines.push(`Shop Enabled: ${d.enabled !== false}`, `Redemption Channel: ${d.redeemChannel ? `<#${d.redeemChannel}>` : "(DMs)"}`);
      break;
    case "daily":
      lines.push(
        `Enabled: ${d.enabled !== false}`,
        `Base Reward: ${d.baseMiles || 100} miles/day`,
        `Streak Bonus: ${d.streakBonus || 50} miles per day streak`
      );
      break;
    case "events":
      lines.push(`Events Enabled: ${d.eventsEnabled !== false}`, `Alliances Enabled: ${d.alliancesEnabled !== false}`);
      break;
    case "premium":
      lines.push("Premium features will be checked at activation.");
      break;
    case "review":
      lines.push("Review complete configuration below:", "");
      for (const s of SECTIONS) {
        if (s === "premium") continue;
        const hasData = Object.keys(state.data[s] || {}).length > 0;
        lines.push(`- ${hasData ? "**'" + SECTION_NAMES[s] + "' configured**" : "*" + SECTION_NAMES[s] + "* (defaults)"}`);
      }
      break;
  }

  return lines.join("\n");
}

function buildNavigationButtons(sectionIdx) {
  const prevDisabled = sectionIdx === 0;
  const nextDisabled = sectionIdx >= SECTIONS.length - 1;
  const skipDisabled = sectionIdx === 0;
  const saveDisabled = sectionIdx === SECTIONS.length - 1;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("setup_prev").setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(prevDisabled),
    new ButtonBuilder().setCustomId("setup_next").setLabel("Next").setStyle(ButtonStyle.Primary).setDisabled(nextDisabled),
    new ButtonBuilder().setCustomId("setup_skip").setLabel("Skip").setStyle(ButtonStyle.Tertiary).setDisabled(skipDisabled),
    new ButtonBuilder().setCustomId("setup_save").setLabel("Save").setStyle(ButtonStyle.Success).setDisabled(saveDisabled),
    new ButtonBuilder().setCustomId("setup_cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger),
  );
}

function buildActionButtons(state) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("setup_start").setLabel("Start Setup Wizard").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("setup_review").setLabel("View Configuration").setStyle(ButtonStyle.Secondary),
  );
}

export async function execute(interaction) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!await isStaffAuthorized(interaction.client, interaction.user.id, staffRoles)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }

  const state = await getWizardState(interaction.guildId);
  const db = getDb();

  // Check existing configuration in Firestore
  const configSnap = await db.collection("config").doc("mileageSetup").get();
  if (configSnap.exists && configSnap.data().completed) {
    state.completed = true;
    state.data = { ...state.data, ...configSnap.data() };
  }

  if (!state.completed) {
    // Show start screen
    const lines = [
      "**Miles & More Setup Wizard**",
      "",
      "Welcome! This wizard will guide you through configuring the loyalty system.",
      "",
      "You can pause and resume at any time — progress is saved automatically.",
      "",
      `Current Status: ${state.completed ? "Activated" : "Not yet configured"}`,
    ];
    return interaction.reply({
      ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [lines.join("\n")], buttons: [] }),
      components: [buildActionButtons(state)],
      ephemeral: true,
    });
  } else {
    // Already completed — show reconfiguration screen
    const lines = [
      "**Configuration Centre**",
      "",
      "Your Miles & More system is active. Select an option below:",
      "",
      `Current Section: ${SECTIONS[state.section] ? SECTION_NAMES[SECTIONS[state.section]] : "Identity"}`,
      "",
      ...Object.entries(SECTION_NAMES).map(([k, v]) => `- ${state.data[k] && Object.keys(state.data[k]).length > 0 ? "**" : "*"}${v}*${state.data[k] && Object.keys(state.data[k]).length > 0 ? "**" : ""}`),
    ];
    return interaction.reply({
      ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [lines.join("\n")], buttons: [] }),
      components: [
        new ActionRowBuilder().addComponents(
          ...SECTIONS.map((s, i) => new ButtonBuilder().setCustomId(`setup_edit_${s}`).setLabel(SECTION_NAMES[s]).setStyle(ButtonStyle.Secondary))
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("setup_restart").setLabel("Restart Wizard").setStyle(ButtonStyle.Danger)
        ),
      ],
      ephemeral: true,
    });
  }
}

export async function handleInteraction(interaction, client) {
  const id = interaction.customId;
  if (!id.startsWith("setup_")) return;

  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!await isStaffAuthorized(client, interaction.user.id, staffRoles)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }

  const state = await getWizardState(interaction.guildId);
  const db = getDb();

  if (id === "setup_start") {
    state.section = 0;
    await saveToFirestore(state);
  } else if (id === "setup_review") {
    state.section = SECTIONS.indexOf("review");
    if (state.section < 0) state.section = SECTIONS.length - 1;
    await saveToFirestore(state);
  } else if (id.startsWith("setup_edit_")) {
    const section = id.replace("setup_edit_", "");
    state.section = SECTIONS.indexOf(section);
    if (state.section < 0) state.section = 0;
    await saveToFirestore(state);
  } else if (id === "setup_restart") {
    const fresh = { ...DEFAULT_WIZARD_STATE, data: { ...DEFAULT_WIZARD_STATE.data } };
    for (const key of Object.keys(state.data)) {
      if (key !== "premium") fresh.data[key] = { ...state.data[key] };
    }
    fresh.completed = false;
    Object.assign(state, fresh);
    await saveToFirestore(state);
  } else if (id === "setup_next") {
    state.section = Math.min(state.section + 1, SECTIONS.length - 1);
    await saveToFirestore(state);
  } else if (id === "setup_prev") {
    state.section = Math.max(state.section - 1, 0);
    await saveToFirestore(state);
  } else if (id === "setup_skip") {
    // Move to next section without saving
    state.section = Math.min(state.section + 1, SECTIONS.length - 1);
    await saveToFirestore(state);
  } else if (id === "setup_save") {
    await saveToFirestore(state);
    return interaction.reply({
      ...buildText("Settings saved. Use Next to continue or Review to see all settings."),
      ephemeral: true
    });
  } else if (id === "setup_cancel") {
    return interaction.reply({ ...buildText("Setup cancelled. Changes have not been saved."), ephemeral: true });
  } else if (id === "setup_activate") {
    state.completed = true;
    await saveToFirestore(state);
    return interaction.reply({
      ...buildMessage({
        accentColor: ACCENT.SUCCESS,
        text: ["**Setup Complete!**\n\nThe Miles & More system is now active. Members can use /sign-up to register.\n\nRecommended next steps:\n• Set up routes with /route set\n• Add rewards with /reward add\n• Create your first flight with /flight create"],
      }),
      ephemeral: true,
    });
  }

  // Show current section
  const content = buildSectionEmbed(state.section, state);
  await interaction.update({
    ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [content] }),
    components: [
      buildNavigationButtons(state.section),
      ...(state.section === SECTIONS.length - 1
        ? [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("setup_activate").setLabel("Activate System").setStyle(ButtonStyle.Success)
          )]
        : []),
    ],
  });
}

export default { data, execute, handleInteraction };
