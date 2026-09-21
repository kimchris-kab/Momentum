import { atDate, suite } from "./harness.mjs";
import {
  MONEY_MINIMUMS, activeMonths, hasMoneyEvidence, moneyFindings, repeatOverruns, spendTrend,
  wantsConcentration,
} from "../src/lib/moneyInsights.js";

const t = suite("money insights");

const TODAY = "2026-09-19";
const CLOCK = `${TODAY}T12:00:00`;

let id = 0;
const tx = (patch) => ({ id: ++id, type: "expense", amount: 50, catId: "groceries", date: "2026-09-05", payee: "", note: "", ...patch });
const month = (mKey, { spend = 0, income = 0, catId = "groceries", n = 1, payee = "" } = {}) => [
  ...(income ? [tx({ type: "income", amount: income, catId: "salary", date: `${mKey}-01` })] : []),
  ...Array.from({ length: n }, (_, i) =>
    tx({ amount: spend / n, catId, date: `${mKey}-${String(5 + i).padStart(2, "0")}`, payee })),
];
const labels = (findings) => findings.map((f) => f.label);

t.group("only with something behind it");
{
  // Same discipline as the habit findings: a handful of rows is not a financial picture.
  t.eq("the floor", MONEY_MINIMUMS.MIN_TX, 12);
  t.eq("a nearly empty ledger says nothing", moneyFindings({ transactions: [tx({}), tx({})] }), []);
  t.ok("...and the section knows to stay hidden", !hasMoneyEvidence({ transactions: [tx({})] }));
  t.ok("a full one doesn't hide", hasMoneyEvidence({ transactions: Array.from({ length: 12 }, () => tx({})) }));
  t.eq("no transactions at all", moneyFindings({}), []);
}

t.group("which way spending is going");
{
  const months = (amounts) => amounts.map((totalExpense, i) => ({ mKey: `m${i}`, totalExpense, count: 3 }));
  // Two points is a line, not a trend.
  t.eq("two months is not a direction", spendTrend(months([100, 200])), null);
  const rising = spendTrend(months([100, 110, 200, 220]));
  t.eq("four months, halves compared", [rising.before, rising.after], [105, 210]);
  t.eq("...as a percentage", rising.pct, 100);
  t.ok("falling is negative", spendTrend(months([200, 220, 100, 110])).pct < 0);
  // One wild month at either end shouldn't get to name the trend on its own.
  t.ok("a single spike doesn't swing it far", Math.abs(spendTrend(months([100, 100, 100, 160])).pct) < 35,
    spendTrend(months([100, 100, 100, 160])));
  t.eq("nothing spent early on gives no percentage", spendTrend(months([0, 0, 100, 100])), null);

  const list = [...month("2026-07", { spend: 300, n: 4 }), ...month("2026-08", { spend: 300, n: 4 }),
    ...month("2026-09", { spend: 600, n: 4 })];
  t.eq("months with nothing in them are skipped", activeMonths(list, "2026-09", 6).length, 3);
}

t.group("budgets that keep breaking");
{
  const state = {
    categoryBudgets: { dining: 100 },
    transactions: [
      ...month("2026-07", { spend: 200, catId: "dining", n: 2 }),
      ...month("2026-08", { spend: 180, catId: "dining", n: 2 }),
      ...month("2026-09", { spend: 90, catId: "dining", n: 2 }),
    ],
  };
  const over = repeatOverruns(state, "2026-09", 6);
  t.eq("a category that broke twice is named", over.map((o) => o.catId), ["dining"]);
  t.eq("...with how many months", over[0].months, 2);
  t.ok("...and by how much", over[0].over > 0);
  // Once is a month, twice is a habit.
  t.eq("once isn't a pattern", MONEY_MINIMUMS.MIN_OVERRUNS, 2);
  t.eq("a budget kept every month isn't mentioned",
    repeatOverruns({ categoryBudgets: { dining: 500 }, transactions: state.transactions }, "2026-09", 6), []);
  t.eq("no budgets, nothing to break", repeatOverruns({ transactions: state.transactions }, "2026-09", 6), []);
}

t.group("where the spending money goes");
{
  const heavy = [
    ...month("2026-09", { spend: 400, catId: "dining", n: 4 }),
    ...month("2026-09", { spend: 100, catId: "shopping", n: 2 }),
  ];
  const focus = wantsConcentration(heavy, "2026-09");
  t.eq("the biggest slice of the wants bucket", focus.catId, "dining");
  t.eq("...as a share", focus.share, 80);
  t.eq("...with both figures", [focus.amount, focus.total], [400, 500]);

  const even = [
    ...month("2026-09", { spend: 200, catId: "dining", n: 2 }),
    ...month("2026-09", { spend: 200, catId: "shopping", n: 2 }),
    ...month("2026-09", { spend: 200, catId: "travel", n: 2 }),
  ];
  // Nothing dominates, so there's nothing to point at.
  t.eq("evenly spread says nothing", wantsConcentration(even, "2026-09"), null);
  t.eq("needs are not discretionary spending",
    wantsConcentration(month("2026-09", { spend: 900, catId: "rent", n: 4 }), "2026-09"), null);
  t.eq("too few entries to characterise",
    wantsConcentration(month("2026-09", { spend: 400, catId: "dining", n: 2 }), "2026-09"), null);
}

t.group("the findings themselves");
atDate(CLOCK, () => {
  // Saving means money actually moved into the savings bucket — spending less on groceries
  // is not saving, and the rate is computed from the bucket rather than from what's left over.
  const twelveMonths = (spend, saved = 500) => ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
    .flatMap((m) => [
      ...month(m, { spend, income: 2000, n: 3 }),
      ...(saved ? month(m, { spend: saved, catId: "saving", n: 1 }) : []),
    ]);

  const steady = moneyFindings({ transactions: twelveMonths(600) }, { today: TODAY });
  t.ok("a steady saver is told so", labels(steady).includes("You're putting money aside"), labels(steady));
  t.ok("...and nothing is invented about a flat trend",
    !labels(steady).some((l) => /rising|falling/.test(l)), labels(steady));

  const spending = moneyFindings({
    transactions: [
      ...["2026-04", "2026-05", "2026-06"].flatMap((m) => month(m, { spend: 400, income: 2000, n: 3 })),
      ...["2026-07", "2026-08", "2026-09"].flatMap((m) => month(m, { spend: 900, income: 2000, n: 3 })),
    ],
  }, { today: TODAY });
  t.ok("a rising trend is called out", labels(spending).includes("Spending is rising"), labels(spending));
  t.ok("...with both averages in the sentence",
    /400.*900|900/.test(spending.find((f) => f.label === "Spending is rising").text));

  // A percentage of a number the app was never told is not a fact.
  const nothingSaved = moneyFindings({ transactions: twelveMonths(600, 0) }, { today: TODAY });
  t.ok("...and a non-saver is told that instead",
    labels(nothingSaved).includes("Nothing is being set aside"), labels(nothingSaved));
  t.ok("...with one concrete thing to do about it",
    /standing transfer/.test(nothingSaved.find((f) => /set aside/.test(f.label)).text));

  const noIncome = moneyFindings({ transactions: twelveMonths(600).filter((x) => x.type !== "income") },
    { today: TODAY });
  t.ok("no income logged means no savings claim",
    !labels(noIncome).some((l) => /aside|set aside/i.test(l)), labels(noIncome));

  const overspending = moneyFindings({
    categoryBudgets: { dining: 100 },
    transactions: [
      ...["2026-07", "2026-08", "2026-09"].flatMap((m) => month(m, { spend: 300, catId: "dining", income: 2000, n: 3 })),
    ],
  }, { today: TODAY });
  t.ok("a budget broken repeatedly is named", labels(overspending).some((l) => /keeps going over/.test(l)),
    labels(overspending));
  t.ok("...and says the budget itself might be the problem",
    /wrong number|wrong category/.test(overspending.find((f) => /keeps going over/.test(f.label)).text));

  const subscriptions = moneyFindings({
    transactions: [
      ...twelveMonths(300),
      ...["2026-06", "2026-07", "2026-08", "2026-09"].map((m) =>
        tx({ amount: 10, catId: "subscriptions", date: `${m}-11`, payee: "Netflix" })),
      ...["2026-06", "2026-07", "2026-08", "2026-09"].map((m) =>
        tx({ amount: 30, catId: "health", date: `${m}-03`, payee: "Gym" })),
    ],
  }, { today: TODAY });
  const subsFinding = subscriptions.find((f) => /repeating charges/i.test(f.label));
  t.ok("quiet repeating charges are totalled", !!subsFinding, labels(subscriptions));
  t.ok("...annualised, because that's the number that matters", /a year/.test(subsFinding.text));
  t.ok("...and as a share of income", /% of what you earn/.test(subsFinding.text), subsFinding.text);

  const red = moneyFindings({
    transactions: [...twelveMonths(300), ...month("2026-09", { spend: 3000, n: 4 })],
  }, { today: TODAY });
  t.ok("a month spending more than it earned is flagged",
    labels(red).includes("This month is in the red"), labels(red));

  t.ok("every finding carries its numbers",
    [...steady, ...spending, ...red].every((f) => /\d/.test(f.text)));
  t.ok("...and a tone to render by",
    [...steady, ...spending, ...red].every((f) => ["good", "bad"].includes(f.tone)));
});
