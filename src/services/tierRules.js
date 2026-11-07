/**
 * tierRules.js — Pure status-tier rules. No imports, no side effects.
 *
 * Isolated from tiers.js so these rules are unit-testable without booting the
 * env-validating config module or connecting to Firestore.
 *
 * Design rule, per spec: status is driven by LIFETIME QUALIFYING metrics, never
 * by the current spendable balance. Spending points cannot demote a member.
 */

export const QUALIFYING_METRICS = {
  LIFETIME_QUALIFYING_POINTS: "lifetimeQualifyingPoints",
  QUALIFYING_FLIGHT_COUNT: "qualifyingFlightCount",
};

/** Compute the tier a member currently qualifies for. */
export function computeTier(metrics, config) {
  const tiers = config?.tiers?.list || [];
  if (!tiers.length) return { key: "explorer", name: "Explorer", min: 0 };

  const value =
    config?.qualifyingMetric === QUALIFYING_METRICS.QUALIFYING_FLIGHT_COUNT
      ? Number(metrics?.qualifyingFlightCount ?? 0)
      : Number(metrics?.qualifyingPoints ?? 0);

  let current = tiers[0];
  for (const tier of tiers) {
    if (value >= tier.min) current = tier;
  }
  return current;
}

/** Progress toward the next tier, for profile displays. */
export function tierProgress(metrics, config) {
  const tiers = config?.tiers?.list || [];
  if (!tiers.length) return null;

  const current = computeTier(metrics, config);
  const index = tiers.findIndex((t) => t.key === current.key);
  const next = index >= 0 && index < tiers.length - 1 ? tiers[index + 1] : null;

  const value =
    config?.qualifyingMetric === QUALIFYING_METRICS.QUALIFYING_FLIGHT_COUNT
      ? Number(metrics?.qualifyingFlightCount ?? 0)
      : Number(metrics?.qualifyingPoints ?? 0);

  if (!next) {
    return { current, next: null, value, percent: 100, remaining: 0, metric: config?.qualifyingMetric };
  }

  const span = next.min - current.min;
  const progressed = value - current.min;
  const percent = span > 0 ? Math.min(100, Math.round((progressed / span) * 100)) : 100;
  const remaining = Math.max(0, next.min - value);

  return { current, next, value, percent, remaining, metric: config?.qualifyingMetric };
}

/** Human-readable metric label, used in profile copy. */
export function qualifyingMetricLabel(config) {
  return config?.qualifyingMetric === QUALIFYING_METRICS.QUALIFYING_FLIGHT_COUNT
    ? "completed qualifying flights"
    : "lifetime qualifying points";
}

export default { computeTier, tierProgress, qualifyingMetricLabel, QUALIFYING_METRICS };