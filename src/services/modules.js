/**
 * modules.js — System 9: Composable Module System & Manifest Registry.
 *
 * Defines the core platform services, initial feature modules,
 * and manifest contracts per AeroNexus Section 9.
 */

export const CORE_MODULES = [
  { id: "core.auth", name: "Authentication", essential: true },
  { id: "core.permissions", name: "Permission Enforcement", essential: true },
  { id: "core.ledger", name: "Transaction Ledger", essential: true },
  { id: "core.audit", name: "Audit Logging", essential: true },
];

export const FEATURE_MODULES = [
  {
    id: "com.aeronexus.flights",
    name: "Flight Operations",
    version: "1.0.0",
    description: "Flight scheduling, briefings, check-in, passenger manifests, and completion.",
    capabilities: ["flights.create", "flights.update", "flights.log", "flights.view"],
    dependencies: ["core.ledger"],
    enabledByDefault: true,
  },
  {
    id: "com.aeronexus.rewards",
    name: "Rewards & Loyalty",
    version: "1.0.0",
    description: "Miles, tiers, catalogue, and economy credits.",
    capabilities: ["rewards.view", "rewards.adjust", "rewards.redeem"],
    dependencies: ["core.ledger"],
    enabledByDefault: true,
  },
  {
    id: "com.aeronexus.achievements",
    name: "Achievements System",
    version: "1.0.0",
    description: "Milestones, automatic rewards, and badges for member activity.",
    capabilities: ["achievements.view", "achievements.grant"],
    dependencies: ["com.aeronexus.rewards"],
    enabledByDefault: true,
  },
  {
    id: "com.aeronexus.streaks",
    name: "Daily Check-in & Streaks",
    version: "1.0.0",
    description: "Daily engagement rewards and streak progression.",
    capabilities: ["streaks.claim"],
    dependencies: ["com.aeronexus.rewards"],
    enabledByDefault: true,
  },
  {
    id: "com.aeronexus.support",
    name: "Support Tickets",
    version: "1.0.0",
    description: "Private member-to-staff ticket channels with category dispatch.",
    capabilities: ["tickets.open", "tickets.claim", "tickets.close"],
    dependencies: [],
    enabledByDefault: true,
  },
  {
    id: "com.aeronexus.careers",
    name: "Careers & Recruitment",
    version: "1.0.0",
    description: "Application pipelines, DM question flows, and staff review.",
    capabilities: ["careers.apply", "careers.review"],
    dependencies: [],
    enabledByDefault: true,
  },
  {
    id: "com.aeronexus.partnerships",
    name: "Partnerships & Alliances",
    version: "1.0.0",
    description: "Partner airline applications, directory, and shared benefits.",
    capabilities: ["partners.apply", "partners.review"],
    dependencies: [],
    enabledByDefault: true,
  },
  {
    id: "com.aeronexus.automation",
    name: "Automation Engine",
    version: "1.0.0",
    description: "Event-driven workflow triggers and safe scripted actions.",
    capabilities: ["automation.manage"],
    dependencies: [],
    enabledByDefault: true,
  },
  {
    id: "com.aeronexus.analytics",
    name: "Analytics & Reporting",
    version: "1.0.0",
    description: "Operational stats, flight metrics, and member activity reports.",
    capabilities: ["analytics.view"],
    dependencies: [],
    enabledByDefault: true,
  },
];

export function getModuleRegistry() {
  return {
    core: CORE_MODULES,
    features: FEATURE_MODULES,
  };
}

export default { CORE_MODULES, FEATURE_MODULES, getModuleRegistry };
