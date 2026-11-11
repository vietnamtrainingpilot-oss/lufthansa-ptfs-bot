/**
 * dataModel.js — Lufthansa Miles & More Firestore Collection Schema
 *
 * Collection structure for the membership system.
 */

export const COLLECTIONS = {
  // Member accounts
  members: "members",

  // Flight records (reused from existing flight ops)
  flights: "flights",

  // Claim codes
  claims: "claims",

  // Award Mile transactions (ledger)
  mileageLedger: "mileageLedger",

  // Status qualification transactions
  statusLedger: "statusLedger",

  // Redemption records
  redemptions: "redemptions",

  // Rewards catalog
  rewardsCatalog: "rewardsCatalog",

  // Achievements
  achievements: "achievements",

  // Daily rewards
  dailyClaims: "dailyClaims",

  // Events/Bonus periods
  events: "events",

  // Flight routes
  routes: "routes",

  // Promotion codes
  promotions: "promotions",
};

/**
 * Member collection structure
 */
export const MEMBER_SCHEMA = {
  userId: "User's Discord ID",
  passwordHash: "Password hash for signup",
  createdAt: "Account creation timestamp",
  membership: {
    _id: "Current membership tier",
    statusPoints: "Total status points",
    qualifyingPoints: "Total qualifying points",
    honPoints: "HON Circle points (for qualifying members)",
    tierProgress: [
      { tier: "Frequent Traveller", earned: 0, required: 0 },
      { tier: "Senator", earned: 0, required: 2000 },
      { tier: "HON Circle", earned: 0, required: 6000 },
    ],
    lastEarningDate: "Last date with earnings",
    membershipSince: "Join date for HON Circle calc",
  },
  awards: {
    awardMiles: {
      balance: "Current available miles",
      lifetimeEarned: "All-time earned miles",
      lifetimeSpent: "All-time spent miles",
    },
    loyalty: {
      bonusMiles: "Promotional bonus miles",
      membershipBonus: "Annual tier bonus",
      statusBonus: "Status qualification bonus",
      eventBonus: "Event bonus miles",
    },
  },
  history: {
    totalFlights: "Total flights claimed",
    totalDistanceKm: "Total flight distance",
    cabinBreakdown: {
      economy: 0,
      premium: 0,
      business: 0,
      first: 0,
    },
  },
};

/**
 * Mileage transaction ledger entry
 */
export const MILEAGE_TRANSACTION_SCHEMA = {
  id: "Transaction ID",
  userId: "Member who earned/spent",
  type: "earning" | "spending" | "adjustment" | "refund",
  transactionType: "flight" | "redemption" | "bonus" | "refunds" | "adjustment",
  amount: "Miles amount (positive for earning, negative for spending)",
  reason: "Transaction reason",
  flightId: "Associated flight ID (if applicable)",
  referenceId: "External reference (e.g., redemption ID)",
  cabin: "Flight cabin class (if applicable)",
  distanceKm: "Flight distance in km (if applicable)",
  aisleStatusPoints: "Status points from this transaction",
  aisleQualifyingPoints: "Qualifying points from this transaction",
  promotionMiles: "Promotional bonus miles (if any)",
  appliedAt: "Timestamp",
};

/**
 * Redemption record
 */
export const REDEMPTION_SCHEMA = {
  id: "Redemption ID",
  userId: "Member who redeemed",
  claimId: "Associated claim ID",
  itemId: "Reward catalog item ID",
  status: "pending" | "fulfilled" | "refunded" | "failed",
  reward: {
    name: "Item name",
    price: "Mileage price",
    category: "Item category",
  },
  milesDeducted: "Total miles (base + tier + bonus)",
  fulfilledBy: "Staff user ID who fulfilled",
  fulfilledAt: "Fulfillment timestamp",
  createdAt: "Redemption creation timestamp",
};

/**
 * Flight claim
 */
export const CLAIM_SCHEMA = {
  id: "Claim ID",
  flightId: "Associated flight ID",
  member: {
    userId: "Member's Discord ID",
    name: "Member's name",
  },
  cabin: "Flight cabin",
  class: "Seat class (e.g., 12A)",
  claimedAt: "Claim timestamp",
  startDate: "Flight date (for calculation)",
  statuses: {
    economy: "Economy status points",
    premier: "Premier status points",
    business: "Business status points",
  },
};

/**
 * Achievement definition
 */
export const ACHIEVEMENT_SCHEMA = {
  id: "Achievement ID",
  name: "Achievement name",
  description: "Description text",
  category: "Mileage" | "Flights" | "Members" | "Elite",
  type: "milestone" | "completion" | "special",
  trigger: "Condition to trigger",
  triggerType: "flights" | "miles" | "statusPoints" | "redemptions" | "oneTime",
  value: "100" | "500" | "1000" | "5" | "10" | "award",
  pinned: "True/false status",
  pinnedAt: "Founder activation date",
  triggeredAt: "First member achievement timestamp",
};

/**
 * Daily reward
 */
export const DAILY_REWARD_SCHEMA = {
  id: "Daily reward ID",
  userId: "Member who claimed",
  date: "Claim date (YYYY-MM-DD)",
  pointsAwarded: "Miles awarded",
  streak: "Current streak number",
  claimedAt: "Claim timestamp",
};

/**
 * Event/Bonus configuration
 */
export const EVENT_SCHEMA = {
  id: "Event ID",
  name: "Event name",
  type: "holiday" | "alliance" | "community" | "newmember",
  startDate: "Event start time",
  endDate: "Event end time",
  status: "active" | "ended" | "cancelled",
  multiplier: "Multiplier for event" | "statusPoints",
  bonusMilesPerKm: "Bonus miles per km",
  affiliationBonus: "Affiliate bonus miles",
  allianceBonus: "Alliance partner bonus",
};