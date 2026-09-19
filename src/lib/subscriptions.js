import { daysBetween, monthKeyOf, todayStr } from "./date.js";
import { TX_CAT_BY_ID } from "../data/constants.js";

// The ledger already holds the evidence: the same payee, roughly the same amount, once a
// month, for months. Nothing read it. The payee matching written for autocomplete gets run
// across months instead of across a prefix, and the result is the thing nobody tracks —
// what the quiet charges cost in a year. Annualising is the point: £9.99 is nothing and
// £119.88 is a decision, and they are the same charge.

export const MIN_OCCURRENCES = 3;
// Amounts drift (price rises, FX, a tier change). A charge is still the same charge inside
// this band; outside it, it's a different kind of spending that happens to share a payee.
export const AMOUNT_TOLERANCE = 0.25;

/** Payees vary in case, spacing and trailing noise; match on the shape, not the spelling. */
export const normalisePayee = (payee) =>
  String(payee || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Weekly, monthly or annual, from the typical gap between charges. */
export function cadenceOf(gapDays) {
  if (gapDays <= 10) return { id: "weekly", label: "Weekly", perYear: 52 };
  if (gapDays <= 17) return { id: "fortnightly", label: "Every two weeks", perYear: 26 };
  if (gapDays <= 45) return { id: "monthly", label: "Monthly", perYear: 12 };
  if (gapDays <= 135) return { id: "quarterly", label: "Quarterly", perYear: 4 };
  if (gapDays <= 250) return { id: "halfYearly", label: "Twice a year", perYear: 2 };
  return { id: "annual", label: "Yearly", perYear: 1 };
}

/**
 * Repeating charges the app hasn't been told about.
 *
 * Anything already covered by a recurring rule is left out — it's declared, so it isn't a
 * finding. Groups need occurrences in three distinct months (or three charges at a
 * tighter-than-monthly cadence), because two of anything is a coincidence.
 */
export function findSubscriptions(state, today = todayStr()) {
  const { transactions = [], recurring = [], dismissedSubs = [] } = state;

  const declared = new Set(
    (recurring || [])
      .map((r) => normalisePayee(r.payee))
      .filter(Boolean),
  );
  const dismissed = new Set(dismissedSubs);

  const groups = {};
  transactions
    .filter((t) => t.type === "expense" && t.payee && !t.recurringId)
    .forEach((t) => {
      const key = normalisePayee(t.payee);
      if (!key || key.length < 2) return;
      (groups[key] = groups[key] || []).push(t);
    });

  const out = [];
  Object.entries(groups).forEach(([key, all]) => {
    if (declared.has(key) || dismissed.has(key)) return;
    const items = [...all].sort((a, b) => a.date.localeCompare(b.date));
    if (items.length < MIN_OCCURRENCES) return;

    // Cluster on the typical amount, so one big irregular purchase at a shop you also have
    // a subscription with doesn't drag the figure around.
    const typical = median(items.map((t) => t.amount));
    if (!typical) return;
    const steady = items.filter((t) => Math.abs(t.amount - typical) <= typical * AMOUNT_TOLERANCE);
    if (steady.length < MIN_OCCURRENCES) return;

    const gaps = steady.slice(1).map((t, i) => daysBetween(steady[i].date, t.date)).filter((g) => g > 0);
    if (!gaps.length) return;
    const gap = median(gaps);
    const cadence = cadenceOf(gap);

    // Monthly or slower needs three separate months; weekly charges legitimately share one.
    const months = new Set(steady.map((t) => monthKeyOf(t.date)));
    if (cadence.perYear <= 12 && months.size < MIN_OCCURRENCES) return;

    const amount = median(steady.map((t) => t.amount));
    const last = steady[steady.length - 1];
    const first = steady[0];
    const sinceLast = daysBetween(last.date, today);
    const catId = last.catId;

    out.push({
      key,
      payee: last.payee,
      catId,
      label: TX_CAT_BY_ID[catId]?.label || "Other",
      color: TX_CAT_BY_ID[catId]?.color,
      amount: Math.round(amount * 100) / 100,
      count: steady.length,
      cadence,
      gapDays: gap,
      firstSeen: first.date,
      lastSeen: last.date,
      sinceLast,
      // The number worth seeing. Same charge, stated per year.
      annual: Math.round(amount * cadence.perYear * 100) / 100,
      monthly: Math.round(((amount * cadence.perYear) / 12) * 100) / 100,
      // Price drift, if the latest charge sits above the earliest.
      rose: last.amount > first.amount * 1.05 ? { from: first.amount, to: last.amount } : null,
      // Overdue by more than half a cycle — either cancelled, or about to land late.
      stale: sinceLast > gap * 1.5,
      nextDue: null,
    });
  });

  return out.sort((a, b) => b.annual - a.annual);
}

export function subscriptionTotals(subs) {
  const live = subs.filter((s) => !s.stale);
  return {
    count: live.length,
    annual: Math.round(live.reduce((a, s) => a + s.annual, 0) * 100) / 100,
    monthly: Math.round(live.reduce((a, s) => a + s.monthly, 0) * 100) / 100,
    staleCount: subs.length - live.length,
  };
}

/** A recurring rule shaped from a detected charge, so declaring one is a single tap. */
export function ruleFromSubscription(sub) {
  const day = Number(sub.lastSeen.slice(8, 10));
  const weekly = sub.cadence.id === "weekly";
  return {
    type: "expense",
    catId: sub.catId,
    amount: sub.amount,
    payee: sub.payee,
    note: sub.payee,
    freq: weekly ? "weekly" : "monthly",
    dayOfMonth: weekly ? null : day,
    startDate: sub.lastSeen,
    lastPostedDate: sub.lastSeen,
    active: true,
  };
}
