/**
 * loyaltyFormat.js — Shared member-safe formatting for Discord output.
 *
 * Rule: never expose staff notes, internal flags, fraud signals, or private
 * staff annotations. Only display-safe fields reach these helpers.
 */

import { ACCENT } from "../config/brand.js";

const V = 32768; // MessageFlags.IsComponentsV2

/** Discord-safe string escaping for user-supplied display text. */
export function safeText(value, max = 300) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[<>]/g, (c) => (c === "<" ? "\u2039" : "\u203A"))
    .slice(0, max);
}

/** Format a number with thousands separators, no locale surprises. */
export function num(n) {
  return Number(n ?? 0).toLocaleString("en-US");
}

/** Components V2 payload from plain text lines. */
export function lines(text, { accentColor = ACCENT.DEFAULT } = {}) {
  return {
    flags: V,
    components: [
      {
        type: 17,
        accent_color: accentColor,
        components: (Array.isArray(text) ? text : [text]).map((t) => ({ type: 10, content: t })),
      },
    ],
  };
}

/**
 * Member profile card.
 */
export function profileMessage(profile) {
  const b = profile.branding;
  const p = profile.progress;
  const linesOut = [];

  linesOut.push(`## ${b.pointsLabel} profile`);
  linesOut.push(`> ${b.pointsUnit}: **${num(profile.points)}**`);
  linesOut.push(`> ${b.creditsLabel}: **${num(profile.credits)}**`);
  linesOut.push(`> Status: **${profile.tierName}**`);
  linesOut.push("");

  linesOut.push(
    `**Lifetime ${b.pointsUnit} earned:** ${num(profile.lifetimePointsEarned)}  |  ` +
      `**Qualifying flights:** ${num(profile.qualifyingFlightCount)}`
  );

  if (p?.next) {
    const metricLabel = p.metric === "qualifyingFlightCount" ? "flights" : b.pointsUnit;
    linesOut.push(
      `**${p.next.name}:** ${p.percent}% complete — ${num(p.remaining)} more ${metricLabel} required.`
    );
  } else {
    linesOut.push(`You have reached the highest status tier.`);
  }

  if (profile.recentActivity?.length) {
    linesOut.push("");
    linesOut.push("**Recent activity**");
    for (const h of profile.recentActivity.slice(0, 5)) {
      const sign = h.amount >= 0 ? "+" : "";
      const unit = h.currency === "credits" ? b.creditsUnit : b.pointsUnit;
      const when = h.at ? fmtTime(h.at) : "";
      linesOut.push(`\`${sign}${num(h.amount)} ${unit}\` ${safeText(h.reason, 60)} ${when}`);
    }
  } else {
    linesOut.push("");
    linesOut.push("No activity yet. Complete a verified flight to earn your first rewards.");
  }

  return lines(linesOut, { accentColor: ACCENT.DEFAULT });
}

/** Public profile for another member — no ledger detail, no internal metrics. */
export function publicProfileMessage(profile) {
  const b = profile.branding;
  return lines(
    [
      `## ${b.pointsLabel}: ${profile.tierName}`,
      `> Current ${b.pointsUnit}: **${num(profile.points)}**`,
      `> Status: **${profile.tierName}**`,
      `> Qualifying flights: ${num(profile.qualifyingFlightCount)}`,
    ],
    { accentColor: ACCENT.DEFAULT }
  );
}

function fmtTime(t) {
  try {
    const d = t?.toDate ? t.toDate() : new Date(t);
    if (Number.isNaN(d.getTime())) return "";
    return `<t:${Math.floor(d.getTime() / 1000)}:R>`;
  } catch {
    return "";
  }
}

/** Ledger history page. */
export function historyMessage(history, { page, pageCount, branding, currency }) {
  const b = branding;
  const linesOut = [`## Transaction history`];
  if (currency) {
    linesOut.push(`> Currency: ${currency === "credits" ? b.creditsLabel : b.pointsLabel}`);
  }
  linesOut.push("");

  if (!history.length) {
    linesOut.push("No transactions recorded yet.");
  } else {
    for (const h of history) {
      const unit = h.currency === "credits" ? b.creditsUnit : b.pointsUnit;
      const sign = h.amount >= 0 ? "+" : "";
      linesOut.push(
        `\`${sign}${num(h.amount)} ${unit}\` ${safeText(h.reason, 70)} — ${fmtTime(h.at)}`
      );
    }
  }
  linesOut.push("");
  linesOut.push(`Page ${page} of ${pageCount}`);
  return lines(linesOut, { accentColor: ACCENT.DEFAULT });
}

/** Leaderboard. */
export function leaderboardMessage(rows, metricLabel, branding) {
  const linesOut = [`## Leaderboard: ${metricLabel}`];
  linesOut.push("");
  if (!rows.length) {
    linesOut.push("No entries yet.");
  } else {
    for (const r of rows) {
      linesOut.push(
        `**${r.rank}.** <@!${r.userId}> — ${num(r.value)} (${safeText(r.tierName, 30)})`
      );
    }
  }
  return lines(linesOut, { accentColor: ACCENT.DEFAULT });
}

/** Catalogue / shop listing with confirm buttons per item (max 5 per row). */
export function catalogueMessage(items, { title, branding, actionPrefix, unitLabel }) {
  const out = [`## ${title}`, ""];
  const rows = [];
  for (const it of items) {
    const unit = it.currency === "credits" ? branding.creditsUnit : branding.pointsUnit;
    const stock = it.stock === null || it.stock === undefined ? "Unlimited" : `Stock: ${it.stock}`;
    out.push(`**${safeText(it.displayName, 60)}** — ${num(it.price)} ${unit}`);
    if (it.description) out.push(`> ${safeText(it.description, 160)}`);
    out.push(`> ${stock}${it.eligibility?.minTierKey ? ` | Requires ${it.eligibility.minTierKey}` : ""}`);
    out.push("");
  }
  if (!items.length) out.push("Nothing available right now.");

  const components = [{ type: 17, accent_color: ACCENT.DEFAULT, components: [{ type: 10, content: out.join("\n") }] }];

  if (actionPrefix && items.length) {
    const buttons = items.slice(0, 5).map((it) => ({
      type: 2,
      style: 2,
      label: safeText(it.displayName, 80),
      custom_id: `${actionPrefix}:${it.id}`,
    }));
    components.push({ type: 17, components: [{ type: 1, components: buttons }] });
  }
  return { flags: V, components };
}

/** Mission list. */
export function missionsMessage(missions, branding) {
  const out = ["## Missions", ""];
  if (!missions.length) {
    out.push("No missions are active right now.");
  } else {
    for (const m of missions) {
      const unit = m.rewardCurrency === "credits" ? branding.creditsUnit : branding.pointsUnit;
      const status = m.claimed ? "Claimed" : m.completed ? "Ready to claim" : `${m.progress}/${m.target}`;
      out.push(`**${safeText(m.title, 70)}** — ${status}`);
      if (m.description) out.push(`> ${safeText(m.description, 160)}`);
      out.push(`> Reward: ${num(m.rewardAmount)} ${unit}`);
      out.push("");
    }
  }
  return lines(out, { accentColor: ACCENT.DEFAULT });
}

/** Simple confirmation / result card. */
export function resultMessage(title, body, { ok = true } = {}) {
  return lines([`## ${title}`, `> ${safeText(body, 900)}`], {
    accentColor: ok ? ACCENT.SUCCESS : ACCENT.DANGER,
  });
}

export default {
  safeText,
  num,
  lines,
  profileMessage,
  publicProfileMessage,
  historyMessage,
  leaderboardMessage,
  catalogueMessage,
  missionsMessage,
  resultMessage,
};