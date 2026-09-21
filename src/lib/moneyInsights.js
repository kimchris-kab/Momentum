import { TX_CAT_BY_ID } from "../data/constants.js";
import { money, monthKeyOf, todayStr } from "./date.js";
import { monthTotals, shiftMonth, txBucket } from "./money.js";
import { categoryBudgetStatus } from "./budget.js";
import { findSubscriptions, subscriptionTotals } from "./subscriptions.js";

// Insights looked at habits and mood and knew nothing about money, while the money views
// looked at money and knew nothing about the rest. The data for both has been sitting in the
// same state object all along.
//
// Same discipline as the habit findings: nothing is said without enough behind it. Two
// months is not a trend, one overspend is not a pattern, and a percentage of a number you
// never told the app is not a fact. Every sentence carries the figures it was derived from,
// so it can be argued with.

const MIN_TX = 12;          // below this the ledger is too sparse to characterise
const MIN_MONTHS = 3;       // a direction needs three points, not two
const MIN_OVERRUNS = 2;     // once is a month, twice is a habit

const monthsBack = (count, endMonth) =>
  Array.from({ length: count }, (_, i) => shiftMonth(endMonth, -(count - 1 - i)));

/** Months with anything in them at all — an empty month is not evidence of frugality. */
export function activeMonths(transactions, endMonth, count = 6) {
  return monthsBack(count, endMonth)
    .map((mKey) => ({ mKey, ...monthTotals(transactions, mKey) }))
    .filter((m) => m.count > 0);
}

/** The direction of spending across the window, as a percentage, or null when it can't be said. */
export function spendTrend(months) {
  if (months.length < MIN_MONTHS) return null;
  // Compare the two halves rather than first-against-last: one unusual month at either end
  // shouldn't get to name the trend.
  const half = Math.floor(months.length / 2);
  const older = months.slice(0, half);
  const newer = months.slice(months.length - half);
  const mean = (list) => list.reduce((a, m) => a + m.totalExpense, 0) / list.length;
  const before = mean(older);
  const after = mean(newer);
  if (before <= 0) return null;
  const pct = Math.round(((after - before) / before) * 100);
  return { before: Math.round(before), after: Math.round(after), pct, months: months.length };
}

/** Categories that went over budget more than once in the window. */
export function repeatOverruns(state, endMonth, count = 6) {
  const tally = {};
  monthsBack(count, endMonth).forEach((mKey) => {
    categoryBudgetStatus(state, mKey, `${mKey}-28`).forEach((row) => {
      if (row.status !== "over") return;
      tally[row.catId] = tally[row.catId] || { catId: row.catId, label: row.label, months: 0, over: 0 };
      tally[row.catId].months++;
      tally[row.catId].over += Math.abs(row.remaining);
    });
  });
  return Object.values(tally)
    .filter((row) => row.months >= MIN_OVERRUNS)
    .sort((a, b) => b.months - a.months || b.over - a.over);
}

/** Where the discretionary money actually goes, as a share of the "wants" bucket. */
export function wantsConcentration(transactions, mKey) {
  const wants = transactions.filter((t) =>
    t.type === "expense" && monthKeyOf(t.date) === mKey && txBucket(t) === "wants");
  const total = wants.reduce((a, t) => a + t.amount, 0);
  if (total <= 0 || wants.length < 4) return null;
  const byCat = {};
  wants.forEach((t) => {
    const id = t.catId || "other_expense";
    byCat[id] = (byCat[id] || 0) + t.amount;
  });
  const [catId, amount] = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const share = Math.round((amount / total) * 100);
  // Only worth a sentence when one thing genuinely dominates.
  if (share < 45) return null;
  return { catId, label: TX_CAT_BY_ID[catId]?.label || "Other", amount: Math.round(amount), total: Math.round(total), share };
}

/**
 * Money findings, in the same { tone, label, text } shape the habit findings use so they can
 * be rendered by the same card.
 */
export function moneyFindings(state, { today = todayStr(), months = 6 } = {}) {
  const { transactions = [] } = state;
  const out = [];
  if (transactions.length < MIN_TX) return out;

  const endMonth = monthKeyOf(today);
  const active = activeMonths(transactions, endMonth, months);
  const thisMonth = monthTotals(transactions, endMonth);

  // ---- Which way spending is going ----
  const trend = spendTrend(active);
  if (trend && Math.abs(trend.pct) >= 12) {
    out.push({
      tone: trend.pct < 0 ? "good" : "bad",
      label: trend.pct < 0 ? "Spending is falling" : "Spending is rising",
      text: `Across ${trend.months} months your spending ${trend.pct < 0 ? "fell" : "rose"} `
        + `${Math.abs(trend.pct)}% — ${money(trend.before)} a month early on against ${money(trend.after)} lately.`,
    });
  }

  // ---- Savings rate, only against income the app actually knows ----
  const withIncome = active.filter((m) => m.income > 0);
  if (withIncome.length >= MIN_MONTHS) {
    const rate = Math.round(
      withIncome.reduce((a, m) => a + m.savingsRate, 0) / withIncome.length);
    if (rate >= 20) {
      out.push({
        tone: "good",
        label: "You're putting money aside",
        text: `You've saved ${rate}% of what came in, averaged over ${withIncome.length} months. `
          + "That's the number that compounds — the rest is detail.",
      });
    } else if (rate <= 5) {
      out.push({
        tone: "bad",
        label: "Nothing is being set aside",
        text: `Savings have averaged ${rate}% of income over ${withIncome.length} months. `
          + "One standing transfer on payday moves this more than any amount of careful spending.",
      });
    }
  }

  // ---- Budgets that keep breaking ----
  repeatOverruns(state, endMonth, months).slice(0, 1).forEach((row) => {
    out.push({
      tone: "bad",
      label: `${row.label} keeps going over`,
      text: `${row.label} has broken its budget in ${row.months} of the last ${months} months, `
        + `by ${money(Math.round(row.over / row.months))} on average. `
        + "A budget you miss every month isn't a budget — either it's the wrong number or it's the wrong category to cap.",
    });
  });

  // ---- What the quiet charges cost ----
  const subs = findSubscriptions(state, today);
  const totals = subscriptionTotals(subs);
  if (totals.count >= 2 && totals.annual > 0) {
    const income = withIncome.length
      ? Math.round(withIncome.reduce((a, m) => a + m.income, 0) / withIncome.length)
      : 0;
    const share = income > 0 ? Math.round((totals.monthly / income) * 100) : null;
    out.push({
      tone: "bad",
      label: "Undeclared repeating charges",
      text: `${totals.count} charges repeat quietly: ${money(totals.monthly)} a month, `
        + `${money(totals.annual)} a year`
        + (share !== null ? `, about ${share}% of what you earn.` : ".")
        + " Each one is small; the total is a decision.",
    });
  }

  // ---- Where the discretionary money goes ----
  const focus = wantsConcentration(transactions, endMonth);
  if (focus) {
    out.push({
      tone: "bad",
      label: `${focus.label} is most of your spending money`,
      text: `${focus.label} took ${focus.share}% of this month's wants — ${money(focus.amount)} `
        + `of ${money(focus.total)}. Worth knowing before you cut anything else.`,
    });
  }

  // ---- A month that's running away with itself ----
  if (thisMonth.count >= 4 && thisMonth.income > 0 && thisMonth.net < 0) {
    out.push({
      tone: "bad",
      label: "This month is in the red",
      text: `You've spent ${money(thisMonth.totalExpense)} against ${money(thisMonth.income)} in. `
        + `That's ${money(Math.abs(thisMonth.net))} more than came in.`,
    });
  }

  return out;
}

/** Whether there's any point showing the money section at all. */
export const hasMoneyEvidence = (state) => (state.transactions || []).length >= MIN_TX;
export const MONEY_MINIMUMS = { MIN_TX, MIN_MONTHS, MIN_OVERRUNS };
