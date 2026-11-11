export function resolveTier(statusPoints) {
  if (statusPoints >= 6000) return "HON Circle";
  if (statusPoints >= 2000) return "Senator";
  return "Frequent Traveller";
}

export async function checkAndAdvanceTiers() { return null; }

export async function getTierDisplay() { return null; }

export default { resolveTier, checkAndAdvanceTiers, getTierDisplay };