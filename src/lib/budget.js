import { daysBetween, monthKeyOf, pad, parseD, todayStr } from "./date.js";
import { TX_CATEGORIES, TX_CAT_BY_ID } from "../data/constants.js";
import { nextOccurrence, txBucket } from "./money.js";

// Every number in Money looked backwards: what you spent, in buckets, last month. The
// recurring rules already knew rent posts on the 1st — that knowledge was used to POST
// entries and never to warn anyone. This turns it forwards.

const daysInMonth = (mKey) => {
  const [y, m] = mKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};
const monthEnd = (mKey) => `${mKey}-${pad(daysInMonth(mKey))}`;
const monthStart = (mKey) => `${mKey}-01`;

/**
 * Recurring occurrences that fall between two dates and haven't been posted yet.
 * lastPostedDate is the source of truth for "already happened", so nothing is double-counted
 * against a charge that has already landed in the ledger.
 */
export function upcomingRecurring(recurring, from, to) {
  const out = [];
  (recurring || []).forEach((rule) => {
    if (!rule.active) return;
    // Start from the occurrence after the last posted one, or the rule's own start.
    let cursor = rule.lastPostedDate ? nextOccurrence(rule, rule.lastPostedDate) : rule.startDate;
    let guard = 0;
    while (cursor && cursor <= to && guard < 400) {
      guard++;
      if (cursor >= from) out.push({ rule, date: cursor, amount: rule.amount, type: rule.type });
      cursor = nextOccurrence(rule, cursor);
    }
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * What's genuinely free between now and the end of the month.
 *
 * Income comes from the monthlyIncome setting when it's been set, because that's a
 * statement about the whole month; otherwise it falls back to income actually logged, which
 * is the honest number when nobody has told the app what they earn.
 */
export function safeToSpend(state, mKey = monthKeyOf(todayStr()), today = todayStr()) {
  const { transactions = [], recurring = [], monthlyIncome } = state;
  const inMonth = transactions.filter((t) => monthKeyOf(t.date) === mKey);

  const loggedIncome = inMonth.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0);
  const spent = inMonth.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0);

  const expected = parseFloat(monthlyIncome) || 0;
  const income = expected > 0 ? expected : loggedIncome;
  const incomeSource = expected > 0 ? "expected" : "logged";

  // Only look ahead inside the month being viewed, and only from tomorrow — today's charges
  // either already landed or are about to, and counting both ways would be wrong.
  const from = today > monthStart(mKey) ? today : monthStart(mKey);
  const ahead = upcomingRecurring(recurring, from, monthEnd(mKey))
    .filter((o) => o.date > today);
  const committed = ahead.filter((o) => o.type === "expense").reduce((a, o) => a + o.amount, 0);
  const incomeAhead = ahead.filter((o) => o.type === "income").reduce((a, o) => a + o.amount, 0);

  const isCurrentMonth = monthKeyOf(today) === mKey;
  const daysLeft = isCurrentMonth
    ? Math.max(1, daysBetween(today, monthEnd(mKey)) + 1)
    : 0;

  const free = income + (incomeSource === "logged" ? incomeAhead : 0) - spent - committed;

  return {
    income,
    incomeSource,
    loggedIncome,
    spent,
    committed,
    incomeAhead,
    upcoming: ahead,
    free: Math.round(free * 100) / 100,
    daysLeft,
    perDay: daysLeft > 0 ? Math.round((free / daysLeft) * 100) / 100 : null,
    isCurrentMonth,
    // Nothing useful to say without either a stated income or some logged income.
    hasBasis: income > 0,
  };
}

// ---- Per-category budgets ----
// budgetSplit covered three buckets and nothing finer. Fifteen categories, and no way to say
// "£200 on eating out". The pace comparison is the useful half: "78% spent" is neutral,
// "78% spent on the 12th" is a decision.
export const PACE_TOLERANCE = 0.1;

export const monthFraction = (mKey, today = todayStr()) => {
  if (monthKeyOf(today) !== mKey) return 1;
  return Math.min(1, parseD(today).getDate() / daysInMonth(mKey));
};

export function categoryBudgetStatus(state, mKey = monthKeyOf(todayStr()), today = todayStr()) {
  const { transactions = [], categoryBudgets = {} } = state;
  const elapsed = monthFraction(mKey, today);

  const spentBy = {};
  transactions
    .filter((t) => t.type === "expense" && monthKeyOf(t.date) === mKey)
    .forEach((t) => {
      const id = t.catId || "other_expense";
      spentBy[id] = (spentBy[id] || 0) + t.amount;
    });

  return Object.entries(categoryBudgets)
    .filter(([, budget]) => budget > 0)
    .map(([catId, budget]) => {
      const cat = TX_CAT_BY_ID[catId];
      const spent = spentBy[catId] || 0;
      const pct = budget > 0 ? spent / budget : 0;
      // Where this month lands if the rest of it looks like the part already gone.
      const projected = elapsed > 0 ? Math.round((spent / elapsed) * 100) / 100 : spent;
      const status = pct >= 1 ? "over"
        : pct > elapsed + PACE_TOLERANCE ? "fast"
        : pct < elapsed - PACE_TOLERANCE ? "slow"
        : "onPace";
      return {
        catId,
        label: cat?.label || "Other",
        color: cat?.color,
        bucket: cat?.bucket,
        budget,
        spent,
        remaining: Math.round((budget - spent) * 100) / 100,
        pct: Math.round(pct * 100),
        elapsedPct: Math.round(elapsed * 100),
        projected,
        status,
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

export const STATUS_COPY = {
  over: "Over budget",
  fast: "Ahead of pace",
  onPace: "On pace",
  slow: "Under pace",
};

/** Categories worth offering a budget for: the ones actually used. */
export function budgetCandidates(transactions, limit = 8) {
  const totals = {};
  (transactions || [])
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      const id = t.catId || "other_expense";
      totals[id] = (totals[id] || 0) + t.amount;
    });
  const used = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const rest = TX_CATEGORIES.filter((c) => c.type === "expense" && !used.includes(c.id)).map((c) => c.id);
  return [...used, ...rest].slice(0, limit).map((id) => TX_CAT_BY_ID[id]).filter(Boolean);
}

/** A typical month for this category, to suggest a starting figure rather than a blank box. */
export function suggestBudget(transactions, catId, months = 3, today = todayStr()) {
  const byMonth = {};
  (transactions || [])
    .filter((t) => t.type === "expense" && t.catId === catId && t.date < today)
    .forEach((t) => {
      const m = monthKeyOf(t.date);
      byMonth[m] = (byMonth[m] || 0) + t.amount;
    });
  const values = Object.entries(byMonth)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, months)
    .map(([, v]) => v);
  if (!values.length) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  // Rounded to something a person would actually type.
  return Math.max(5, Math.round(mean / 5) * 5);
}
