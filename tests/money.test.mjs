import { atDate, suite } from "./harness.mjs";
import {
  amountSuggestions, categoryBreakdown, describeRule, evalAmount, filterLedger, groupByDate,
  isSum, monthTotals, monthsFlow, netWorthChange, netWorthSeries, nextOccurrence,
  payeeSuggestion, postDueRecurring, rankedCategories, shiftMonth, transactionsToCsv, txBucket,
} from "../src/lib/money.js";

const t = suite("money");

const TODAY = "2026-09-19T12:00:00";
const tx = (patch) => ({
  id: 1, type: "expense", amount: 10, catId: "groceries", date: "2026-09-05", payee: "", note: "", ...patch,
});

t.group("buckets");
{
  t.eq("a category decides the bucket", txBucket(tx({ catId: "dining" })), "wants");
  // v1 entries carry only a bucket and no category; they still have to total correctly.
  t.eq("a v1 entry's own bucket wins", txBucket(tx({ catId: null, category: "needs" })), "needs");
  t.eq("an entry with neither falls somewhere sensible", txBucket(tx({ catId: null })), "wants");
}

t.group("month arithmetic");
{
  t.eq("forwards", shiftMonth("2026-09", 1), "2026-10");
  t.eq("backwards over a year boundary", shiftMonth("2026-01", -1), "2025-12");
  t.eq("a long way back", shiftMonth("2026-09", -12), "2025-09");
}

t.group("totals");
{
  const list = [
    tx({ id: 1, type: "income", amount: 2000, catId: "salary" }),
    tx({ id: 2, amount: 500, catId: "rent" }),       // needs
    tx({ id: 3, amount: 100, catId: "dining" }),     // wants
    tx({ id: 4, amount: 400, catId: "saving" }),     // savings
    tx({ id: 5, amount: 999, date: "2026-08-05" }),  // another month
  ];
  const m = monthTotals(list, "2026-09");
  t.eq("income", m.income, 2000);
  t.eq("expenses by bucket", m.byBucket, { needs: 500, wants: 100, savings: 400 });
  t.eq("total spent", m.totalExpense, 1000);
  t.eq("net", m.net, 1000);
  t.eq("savings rate is a percentage of income", m.savingsRate, 20);
  t.eq("entries counted are this month's only", m.count, 4);
  t.eq("no income means no savings rate rather than a divide by zero",
    monthTotals([tx({ amount: 50 })], "2026-09").savingsRate, 0);

  const breakdown = categoryBreakdown(list, "2026-09", "expense");
  t.eq("breakdown is biggest first", breakdown.map((c) => c.id), ["rent", "saving", "dining"]);
  t.eq("...with a share of the month", breakdown[0].pct, 50);
  t.eq("...and a label", breakdown[0].label, "Rent / housing");

  const flow = monthsFlow(list, 3, "2026-09");
  t.eq("a flow series runs oldest to newest", flow.map((f) => f.mKey), ["2026-07", "2026-08", "2026-09"]);
  t.eq("...with each month's totals", [flow[1].Expenses, flow[2].Income], [999, 2000]);
}

t.group("the ledger");
{
  const list = [
    tx({ id: 1, payee: "Tesco", catId: "groceries", date: "2026-09-05" }),
    tx({ id: 2, payee: "Bistro", catId: "dining", date: "2026-09-05", note: "birthday" }),
    tx({ id: 3, type: "income", amount: 50, catId: "refund", date: "2026-09-06" }),
    tx({ id: 4, payee: "Old", date: "2026-08-06" }),
  ];
  const all = (f) => filterLedger(list, { mKey: "2026-09", ...f }).map((x) => x.id);
  t.eq("a month at a time", all({}), [3, 2, 1]);
  t.eq("newest first", filterLedger(list, { mKey: "2026-09" })[0].id, 3);
  t.eq("by type", all({ type: "income" }), [3]);
  // Buckets are an expense idea, so income rides along rather than vanishing when one is picked.
  t.eq("by bucket, with income still shown", all({ bucket: "needs" }), [3, 1]);
  t.eq("by bucket and type together", all({ bucket: "needs", type: "expense" }), [1]);
  t.eq("by payee", all({ query: "tesc" }), [1]);
  t.eq("by note", all({ query: "birthday" }), [2]);
  t.eq("by category name", all({ query: "eating" }), [2]);

  const days = groupByDate(filterLedger(list, { mKey: "2026-09" }));
  t.eq("grouped by day, newest first", days.map((d) => d.date), ["2026-09-06", "2026-09-05"]);
  t.eq("each day nets out", days[1].net, -20);
  t.eq("income lifts a day's net", days[0].net, 50);
}

t.group("fast entry");
{
  t.eq("a plain number", evalAmount("12.40"), 12.4);
  t.eq("a running sum", evalAmount("12.40+3+18"), 33.4);
  t.eq("stray characters are ignored", evalAmount("£12.40 + 3"), 15.4);
  t.eq("a trailing operator contributes nothing yet", evalAmount("12+"), 12);
  t.eq("nothing at all is zero", evalAmount(""), 0);
  t.eq("a number passes straight through", evalAmount(7), 7);
  t.ok("a sum is only a sum with two terms", isSum("12+3") && !isSum("12+") && !isSum("12"));
}

t.group("suggestions");
atDate(TODAY, () => {
  const list = [
    tx({ id: 1, catId: "dining", date: "2026-09-01" }),
    tx({ id: 2, catId: "dining", date: "2026-09-02" }),
    tx({ id: 3, catId: "groceries", date: "2026-01-02" }), // old, so worth less
    tx({ id: 4, catId: "groceries", date: "2026-01-03" }),
    tx({ id: 5, catId: "groceries", date: "2026-01-04" }),
  ];
  const { ranked, all } = rankedCategories(list, "expense");
  t.eq("recent use outweighs old use", ranked[0].id, "dining");
  t.ok("every category is still offered behind them", all.length > ranked.length);

  const amounts = amountSuggestions(
    [tx({ amount: 7 }), tx({ amount: 7 }), tx({ amount: 7 }), tx({ amount: 3 })], { type: "expense" });
  t.eq("an amount you keep charging comes first", amounts[0], 7);
  t.ok("round numbers fill the row out", amounts.length === 4 && amounts.includes(10));
  t.ok("a one-off amount isn't a suggestion", !amounts.includes(3));

  const s = payeeSuggestion(
    [tx({ id: 1, payee: "Tesco", amount: 40, catId: "groceries", date: "2026-09-01" }),
     tx({ id: 2, payee: "Tesco", amount: 62, catId: "groceries", date: "2026-09-09" })],
    "tes", "expense");
  t.eq("the most recent entry for that payee is offered", [s.amount, s.catId], [62, "groceries"]);
  t.eq("one letter isn't enough to guess from", payeeSuggestion([], "t", "expense"), null);
});

t.group("recurring rules");
{
  const rule = { id: 1, freq: "monthly", dayOfMonth: 15 };
  t.eq("monthly steps a month", nextOccurrence(rule, "2026-09-15"), "2026-10-15");
  t.eq("weekly steps a week", nextOccurrence({ freq: "weekly" }, "2026-09-15"), "2026-09-22");
  // The 31st of a month that has no 31st has to land somewhere, and the last day is the
  // only answer that doesn't silently skip a month.
  t.eq("a day that doesn't exist lands on the last one",
    nextOccurrence({ freq: "monthly", dayOfMonth: 31 }, "2026-01-31"), "2026-02-28");
  t.eq("describing a monthly rule", describeRule({ freq: "monthly", dayOfMonth: 1 }), "Monthly on the 1st");
  t.eq("...the 2nd", describeRule({ freq: "monthly", dayOfMonth: 2 }), "Monthly on the 2nd");
  t.eq("...the 3rd", describeRule({ freq: "monthly", dayOfMonth: 3 }), "Monthly on the 3rd");
  t.eq("...the 11th, not the 11st", describeRule({ freq: "monthly", dayOfMonth: 11 }), "Monthly on the 11th");
  t.eq("...the 21st", describeRule({ freq: "monthly", dayOfMonth: 21 }), "Monthly on the 21st");
  t.eq("a weekly rule", describeRule({ freq: "weekly" }), "Every week");
}

t.group("posting what's due");
{
  const rules = [{
    id: 1, active: true, type: "expense", amount: 900, catId: "rent", payee: "Landlord",
    freq: "monthly", dayOfMonth: 1, startDate: "2026-06-01", lastPostedDate: "2026-06-01",
  }];
  const posted = postDueRecurring(rules, [], "2026-09-19");
  t.eq("every missed occurrence is posted, not just the latest",
    posted.transactions.map((x) => x.date), ["2026-07-01", "2026-08-01", "2026-09-01"]);
  t.eq("the rule remembers where it got to", posted.recurring[0].lastPostedDate, "2026-09-01");
  t.eq("posted entries carry the rule's id", posted.transactions[0].recurringId, 1);
  t.eq("...and the category's bucket", posted.transactions[0].category, "needs");
  t.eq("nothing due means no state write at all",
    postDueRecurring(posted.recurring, posted.transactions, "2026-09-19"), null);
  t.eq("a paused rule posts nothing",
    postDueRecurring([{ ...rules[0], active: false }], [], "2026-09-19"), null);
  t.eq("no rules at all", postDueRecurring([], [], "2026-09-19"), null);

  const never = postDueRecurring([{ ...rules[0], lastPostedDate: null, startDate: "2026-09-01" }], [], "2026-09-19");
  t.eq("a new rule starts at its start date", never.transactions.map((x) => x.date), ["2026-09-01"]);
}

t.group("net worth");
{
  const log = [
    { date: "2026-08-01", assets: 1000, liabilities: 400 },
    { date: "2026-09-01", assets: 1500, liabilities: 300 },
  ];
  t.eq("a series carries the net", netWorthSeries(log).map((x) => x.net), [600, 1200]);
  t.eq("the change is against the previous snapshot", netWorthChange(log).delta, 600);
  t.eq("...and says when that was", netWorthChange(log).since, "2026-08-01");
  t.eq("one snapshot is no trend", netWorthChange([log[0]]), null);
  t.eq("no snapshots at all", netWorthChange([]), null);
}

t.group("csv export");
{
  const csv = transactionsToCsv([
    tx({ id: 1, amount: 12.5, catId: "groceries", payee: "Tesco", note: 'said "hi", left', date: "2026-09-05" }),
    tx({ id: 2, type: "income", amount: 100, catId: "salary", date: "2026-09-01" }),
  ]);
  const lines = csv.split("\n");
  t.ok("there's a header", lines[0].startsWith("Date,Type,Category"));
  t.eq("oldest first", lines[1].startsWith("2026-09-01"), true);
  t.ok("expenses are negative, income positive", lines[1].endsWith("100.00") && lines[2].endsWith("-12.50"));
  t.ok("a note with a comma and quotes survives", lines[2].includes('"said ""hi"", left"'));
  t.ok("the bucket is spelled out for expenses", lines[2].includes("Needs"));
}
