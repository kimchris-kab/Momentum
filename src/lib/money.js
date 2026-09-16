import { BUDGET_CATS, TX_CATEGORIES, TX_CAT_BY_ID } from "../data/constants.js";
import { addDays, dstr, monthKeyOf, monthLabel, pad, parseD, todayStr } from "./date.js";

export const txBucket = (t) => t.category || TX_CAT_BY_ID[t.catId]?.bucket || "wants";

export const monthKeyNow = () => monthKeyOf(todayStr());
export const shiftMonth = (mKey, delta) => {
  const [y, m] = mKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
export const monthTitle = (mKey) => {
  const [y, m] = mKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

export function monthTotals(transactions, mKey) {
  const inMonth = transactions.filter((t) => monthKeyOf(t.date) === mKey);
  const income = inMonth.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0);
  const byBucket = { needs: 0, wants: 0, savings: 0 };
  inMonth.filter((t) => t.type === "expense").forEach((t) => {
    const b = txBucket(t);
    byBucket[b] = (byBucket[b] || 0) + t.amount;
  });
  const totalExpense = byBucket.needs + byBucket.wants + byBucket.savings;
  const net = income - totalExpense;
  return {
    income, byBucket, totalExpense, net, count: inMonth.length,
    savingsRate: income > 0 ? Math.round((byBucket.savings / income) * 100) : 0,
  };
}

export function categoryBreakdown(transactions, mKey, type = "expense") {
  const totals = {};
  transactions
    .filter((t) => t.type === type && monthKeyOf(t.date) === mKey)
    .forEach((t) => {
      const id = t.catId || (type === "expense" ? "other_expense" : "other_income");
      totals[id] = (totals[id] || 0) + t.amount;
    });
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  return Object.entries(totals)
    .map(([id, amount]) => ({
      id, amount,
      label: TX_CAT_BY_ID[id]?.label || "Other",
      color: TX_CAT_BY_ID[id]?.color || "#948FA9",
      pct: sum ? Math.round((amount / sum) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function monthsFlow(transactions, count = 6, endMonth = monthKeyNow()) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const mKey = shiftMonth(endMonth, -i);
    const t = monthTotals(transactions, mKey);
    out.push({ month: monthLabel(mKey), mKey, Income: t.income, Expenses: t.totalExpense, net: t.net });
  }
  return out;
}

export function filterLedger(transactions, { mKey, query = "", type = "all", bucket = "all" }) {
  const q = query.trim().toLowerCase();
  return transactions
    .filter((t) => (mKey ? monthKeyOf(t.date) === mKey : true))
    .filter((t) => (type === "all" ? true : t.type === type))
    .filter((t) => (bucket === "all" || t.type === "income" ? true : txBucket(t) === bucket))
    .filter((t) => !q || [t.note, t.payee, TX_CAT_BY_ID[t.catId]?.label]
      .some((v) => (v || "").toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.id || 0) - (a.id || 0));
}

export function groupByDate(list) {
  const map = {};
  list.forEach((t) => { (map[t.date] = map[t.date] || []).push(t); });
  return Object.entries(map)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({
      date,
      items,
      net: items.reduce((a, t) => a + (t.type === "income" ? t.amount : -t.amount), 0),
    }));
}

// ---- Fast entry ----
// The amount field accepts a small running sum ("12.40+3+18") so a receipt with several
// lines can be tallied in place instead of in a separate calculator. Anything that isn't a
// digit, a dot or a plus is ignored, and a trailing operator just contributes nothing yet.
export function evalAmount(expr) {
  if (typeof expr === "number") return expr;
  const cleaned = String(expr || "").replace(/[^0-9.+]/g, "");
  if (!cleaned) return 0;
  const total = cleaned.split("+").reduce((sum, part) => sum + (parseFloat(part) || 0), 0);
  return Math.round(total * 100) / 100;
}

// True once the expression holds more than one term worth showing a running total for.
export const isSum = (expr) => String(expr || "").split("+").filter((p) => p !== "").length > 1;

const RECENCY_WINDOW = 90;

// Categories the person actually uses, most-used first, with recent use weighted heavier
// than old use. Everything else keeps its declared order behind them.
export function rankedCategories(transactions, type, today = todayStr()) {
  const all = TX_CATEGORIES.filter((c) => c.type === type);
  const score = {};
  transactions.forEach((t) => {
    if (t.type !== type || !t.catId) return;
    const age = Math.max(0, Math.round((parseD(today) - parseD(t.date)) / 86400000));
    score[t.catId] = (score[t.catId] || 0) + (age <= RECENCY_WINDOW ? 3 : 1);
  });
  const used = all.filter((c) => score[c.id]).sort((a, b) => score[b.id] - score[a.id]);
  return { ranked: used, all, score };
}

// A handful of amounts worth one tap: the ones this category is usually charged at,
// then round numbers to fill the row out.
export function amountSuggestions(transactions, { type, catId }, limit = 4) {
  const counts = {};
  transactions.forEach((t) => {
    if (t.type !== type || !t.amount) return;
    if (catId && t.catId !== catId) return;
    counts[t.amount] = (counts[t.amount] || 0) + 1;
  });
  const seen = Object.entries(counts)
    .map(([amount, n]) => ({ amount: Number(amount), n }))
    .filter((a) => a.n > 1)
    .sort((a, b) => b.n - a.n || b.amount - a.amount)
    .slice(0, limit)
    .map((a) => a.amount);

  const rounded = [10, 20, 50, 100].filter((n) => !seen.includes(n));
  return [...seen, ...rounded].slice(0, limit);
}

// If this payee has been logged before, the last entry is almost always the right shape
// for the new one — offer it rather than applying it silently.
export function payeeSuggestion(transactions, payee, type) {
  const q = String(payee || "").trim().toLowerCase();
  if (q.length < 2) return null;
  const match = transactions
    .filter((t) => t.type === type && (t.payee || "").trim().toLowerCase().startsWith(q))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!match) return null;
  return { catId: match.catId, amount: match.amount, payee: match.payee };
}

// ---- Recurring transactions ----
export const nextOccurrence = (rule, fromDate) => {
  if (rule.freq === "weekly") return addDays(fromDate, 7);
  const d = parseD(fromDate);
  const target = rule.dayOfMonth || d.getDate();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(target, lastDay));
  return dstr(next);
};

// Posts every occurrence that has come due since the rule last fired, up to today.
// Returns null when nothing changed so callers can skip a state write.
export function postDueRecurring(recurring, transactions, today = todayStr()) {
  if (!recurring?.length) return null;
  const added = [];
  let changed = false;

  const updated = recurring.map((rule) => {
    if (!rule.active) return rule;
    let cursor = rule.lastPostedDate ? nextOccurrence(rule, rule.lastPostedDate) : rule.startDate;
    if (!cursor) return rule;
    let last = rule.lastPostedDate;
    let guard = 0;
    while (cursor <= today && guard < 400) {
      guard++;
      added.push({
        id: Date.now() + added.length,
        type: rule.type,
        category: rule.type === "expense" ? (TX_CAT_BY_ID[rule.catId]?.bucket || "wants") : null,
        catId: rule.catId,
        amount: rule.amount,
        note: rule.note || "",
        payee: rule.payee || "",
        date: cursor,
        recurringId: rule.id,
        createdAt: Date.now(),
      });
      last = cursor;
      cursor = nextOccurrence(rule, cursor);
    }
    if (last !== rule.lastPostedDate) {
      changed = true;
      return { ...rule, lastPostedDate: last };
    }
    return rule;
  });

  if (!changed) return null;
  return { recurring: updated, transactions: [...transactions, ...added], addedCount: added.length };
}

export const describeRule = (rule) => {
  if (rule.freq === "weekly") return "Every week";
  const d = rule.dayOfMonth;
  const suffix = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  return `Monthly on the ${d}${suffix}`;
};

// ---- Net worth history ----
export const sortedNetWorth = (log) => [...(log || [])].sort((a, b) => a.date.localeCompare(b.date));

export function netWorthSeries(log) {
  return sortedNetWorth(log).map((e) => ({
    date: e.date,
    label: parseD(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    assets: e.assets,
    liabilities: e.liabilities,
    net: e.assets - e.liabilities,
  }));
}

export function netWorthChange(log) {
  const s = sortedNetWorth(log);
  if (s.length < 2) return null;
  const latest = s[s.length - 1];
  const prev = s[s.length - 2];
  const from = prev.assets - prev.liabilities;
  const to = latest.assets - latest.liabilities;
  return { delta: to - from, from, to, since: prev.date };
}

// ---- Export ----
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function transactionsToCsv(transactions) {
  const header = ["Date", "Type", "Category", "Bucket", "Payee", "Note", "Amount"];
  const rows = [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [
      t.date,
      t.type,
      TX_CAT_BY_ID[t.catId]?.label || "",
      t.type === "expense" ? (BUDGET_CATS.find((b) => b.id === txBucket(t))?.label || "") : "",
      t.payee || "",
      t.note || "",
      (t.type === "expense" ? -t.amount : t.amount).toFixed(2),
    ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
