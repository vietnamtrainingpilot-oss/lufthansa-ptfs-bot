export const SYSTEM_ACHIEVEMENTS = [
  { id: "first_flight", name: "First Flight", description: "Claim your first flight", category: "Mileage" },
  { id: "veteran_traveler", name: "Veteran Traveler", description: "Claim 10 flights", category: "Mileage" },
  { id: "frequent_flyer", name: "Frequent Flyer", description: "Claim 50 flights", category: "Mileage" },
  { id: "first_redemption", name: "First Redemption", description: "Redeem your first reward", category: "Mileage" },
  { id: "mile_mile", name: "Mile Mile", description: "Earn 1,000 Award Miles", category: "Mileage" },
  { id: "century", name: "Century", description: "Earn 10,000 Award Miles", category: "Mileage" },
  { id: "frequent_traveller", name: "Frequent Traveller", description: "Reach Frequent Traveller tier", category: "Members" },
  { id: "senator", name: "Senator", description: "Reach Senator tier", category: "Members" },
  { id: "hon_circle", name: "HON Circle", description: "Reach HON Circle tier", category: "Members" },
];

export async function seedAchievements() { return true; }

export async function checkAchievements() { return []; }

export async function listAchievements() { return []; }

export default { SYSTEM_ACHIEVEMENTS, seedAchievements, checkAchievements, listAchievements };