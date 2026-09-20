import { suite } from "./harness.mjs";
import {
  PACE_TOLERANCE, budgetCandidates, categoryBudgetStatus, monthFraction, safeToSpend,
  suggestBudget, upcomingRecurring,
} from "../src/lib/budget.js";

const t = suite("budget");

t.group("budget.js — upcomingRecurring");
{
  const rent = {
    id: 1, active: true, type: "expense", amount: 900, payee: "Landlord",
    freq: "monthly", dayOfMonth: 1, startDate: "2026-01-01", lastPostedDate: "2026-09-01",
  };
  const gym = {
    id: 2, active: true, type: "expense", amount: 30, payee: "Gym",
    freq: "weekly", startDate: "2026-09-02", lastPostedDate: "2026-09-16",
  };
  const off = { ...rent, id: 3, active: false };
  const wage = {
    id: 4, active: true, type: "income", amount: 2000, payee: "Work",
    freq: "monthly", dayOfMonth: 25, startDate: "2026-01-25", lastPostedDate: "2026-08-25",
  };

  const up = upcomingRecurring([rent, gym, off, wage], "2026-09-19", "2026-09-30");
  t.eq("only the occurrences inside the window", up.map((o) => `${o.date}:${o.rule.id}`),
    ["2026-09-23:2", "2026-09-25:4", "2026-09-30:2"]);
  t.ok("inactive rules are skipped", !up.some((o) => o.rule.id === 3));
  t.ok("a rule posted this month isn't counted again", !up.some((o) => o.rule.id === 1));

  const never = upcomingRecurring([{ ...rent, lastPostedDate: null, startDate: "2026-09-25" }], "2026-09-19", "2026-09-30");
  t.eq("a never-posted rule starts at its startDate", never.map((o) => o.date), ["2026-09-25"]);
}

t.group("budget.js — safeToSpend");
{
  const base = {
    monthlyIncome: "2000",
    transactions: [
      { id: 1, type: "expense", amount: 400, catId: "groceries", date: "2026-09-03" },
      { id: 2, type: "expense", amount: 100, catId: "dining", date: "2026-09-10" },
      { id: 3, type: "income", amount: 2000, catId: "salary", date: "2026-09-01" },
      { id: 4, type: "expense", amount: 999, catId: "groceries", date: "2026-08-15" }, // other month
    ],
    recurring: [{
      id: 1, active: true, type: "expense", amount: 900, payee: "Landlord",
      freq: "monthly", dayOfMonth: 25, startDate: "2026-01-25", lastPostedDate: "2026-08-25",
    }],
  };
  const s = safeToSpend(base, "2026-09", "2026-09-19");
  t.eq("stated income wins over logged", [s.income, s.incomeSource], [2000, "expected"]);
  t.eq("spent is this month's expenses only", s.spent, 500);
  t.eq("committed picks up the unposted rent", s.committed, 900);
  t.near("free = income - spent - committed", s.free, 600);
  t.eq("days left includes today", s.daysLeft, 12);
  t.near("per day", s.perDay, 50);
  t.ok("has a basis", s.hasBasis === true);
  t.ok("is the current month", s.isCurrentMonth === true);

  const noStated = safeToSpend({ ...base, monthlyIncome: "" }, "2026-09", "2026-09-19");
  t.eq("falls back to logged income", [noStated.income, noStated.incomeSource], [2000, "logged"]);

  const empty = safeToSpend({ ...base, monthlyIncome: "", transactions: [] }, "2026-09", "2026-09-19");
  t.ok("no income anywhere means no basis", empty.hasBasis === false);

  const past = safeToSpend(base, "2026-08", "2026-09-19");
  t.eq("a past month has no days left and no per-day", [past.daysLeft, past.perDay], [0, null]);
  t.eq("a past month counts its own spending", past.spent, 999);
  t.eq("a past month has nothing committed ahead", past.committed, 0);

  const withIncomeAhead = safeToSpend({
    ...base, monthlyIncome: "", transactions: [{ id: 9, type: "income", amount: 500, date: "2026-09-02" }],
    recurring: [{
      id: 5, active: true, type: "income", amount: 1500, payee: "Work",
      freq: "monthly", dayOfMonth: 28, startDate: "2026-01-28", lastPostedDate: "2026-08-28",
    }],
  }, "2026-09", "2026-09-19");
  t.eq("logged basis adds income still to land", [withIncomeAhead.incomeAhead, withIncomeAhead.free], [1500, 2000]);
}

t.group("budget.js — category budgets");
{
  t.near("month fraction on the 15th of a 30-day month", monthFraction("2026-09", "2026-09-15"), 0.5);
  t.eq("a month that isn't the current one is fully elapsed", monthFraction("2026-08", "2026-09-19"), 1);

  const state = {
    categoryBudgets: { dining: 200, groceries: 400, transport: 100, shopping: 0 },
    transactions: [
      { id: 1, type: "expense", amount: 210, catId: "dining", date: "2026-09-05" },
      { id: 2, type: "expense", amount: 280, catId: "groceries", date: "2026-09-05" },
      { id: 3, type: "expense", amount: 10, catId: "transport", date: "2026-09-05" },
      { id: 4, type: "income", amount: 50, catId: "salary", date: "2026-09-05" },
      { id: 5, type: "expense", amount: 500, catId: "dining", date: "2026-08-05" },
    ],
  };
  // On the 15th of a 30-day month, elapsed = 0.50.
  const rows = categoryBudgetStatus(state, "2026-09", "2026-09-15");
  t.eq("a zero budget isn't a budget", rows.map((r) => r.catId), ["dining", "groceries", "transport"]);
  t.eq("over budget", [rows[0].status, rows[0].pct, rows[0].remaining], ["over", 105, -10]);
  t.eq("ahead of pace at 70% on day 15", [rows[1].status, rows[1].pct], ["fast", 70]);
  t.eq("under pace at 10% on day 15", [rows[2].status, rows[2].pct], ["slow", 10]);
  t.eq("elapsed is reported alongside", rows[0].elapsedPct, 50);
  t.near("projected doubles a half-elapsed month", rows[1].projected, 560);
  t.eq("labels come from the category table", rows[1].label, "Groceries");
  t.ok("colour comes from the category table", !!rows[1].color);

  const onPace = categoryBudgetStatus(
    { categoryBudgets: { groceries: 400 }, transactions: [{ id: 1, type: "expense", amount: 200, catId: "groceries", date: "2026-09-05" }] },
    "2026-09", "2026-09-15",
  );
  t.eq("exactly on pace", onPace[0].status, "onPace");
  t.eq("the tolerance band is ±10 points", PACE_TOLERANCE, 0.1);

  const uncategorised = categoryBudgetStatus(
    { categoryBudgets: { other_expense: 50 }, transactions: [{ id: 1, type: "expense", amount: 20, date: "2026-09-05" }] },
    "2026-09", "2026-09-15",
  );
  t.eq("an entry with no category lands in Other", uncategorised[0].spent, 20);
}

t.group("budget.js — suggestions");
{
  const txs = [
    { id: 1, type: "expense", amount: 120, catId: "dining", date: "2026-06-05" },
    { id: 2, type: "expense", amount: 80, catId: "dining", date: "2026-07-05" },
    { id: 3, type: "expense", amount: 100, catId: "dining", date: "2026-08-05" },
    { id: 4, type: "expense", amount: 900, catId: "rent", date: "2026-08-01" },
    { id: 5, type: "income", amount: 2000, catId: "salary", date: "2026-08-01" },
  ];
  const cands = budgetCandidates(txs, 4);
  t.eq("used categories lead, biggest first", cands.slice(0, 2).map((c) => c.id), ["rent", "dining"]);
  t.ok("the rest are expense categories", cands.every((c) => c.type === "expense"));
  t.eq("limit is honoured", cands.length, 4);

  t.eq("suggests the mean of the last three months, rounded to 5",
    suggestBudget(txs, "dining", 3, "2026-09-19"), 100);
  t.eq("nothing to suggest without history", suggestBudget(txs, "holiday", 3, "2026-09-19"), null);
  t.eq("only the most recent months count",
    suggestBudget(txs, "dining", 1, "2026-09-19"), 100);
  t.eq("future entries are ignored",
    suggestBudget([...txs, { id: 6, type: "expense", amount: 5000, catId: "dining", date: "2026-10-01" }],
      "dining", 3, "2026-09-19"), 100);
}
