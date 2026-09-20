import { suite } from "./harness.mjs";
import {
  cadenceOf, findSubscriptions, normalisePayee, ruleFromSubscription, subscriptionTotals,
} from "../src/lib/subscriptions.js";

const t = suite("subscriptions");

t.group("subscriptions.js");
{
  t.eq("payees normalise to a shape", normalisePayee("  Net-FLIX*  UK "), "net flix uk");
  t.eq("empty payee normalises to empty", normalisePayee(null), "");
  t.eq("monthly cadence", cadenceOf(30).id, "monthly");
  t.eq("weekly cadence", cadenceOf(7).id, "weekly");
  t.eq("annual cadence", cadenceOf(365).id, "annual");
  t.eq("quarterly cadence", cadenceOf(91).id, "quarterly");

  const mk = (payee, amount, dates, catId = "subscriptions", extra = {}) =>
    dates.map((date, i) => ({ id: `${payee}-${i}`, type: "expense", payee, amount, catId, date, ...extra }));

  const state = {
    transactions: [
      ...mk("Netflix", 9.99, ["2026-06-11", "2026-07-11", "2026-08-11", "2026-09-11"]),
      ...mk("Spotify", 11.99, ["2026-07-05", "2026-08-05"]),           // only twice
      ...mk("Adobe", 20, ["2026-03-02", "2026-04-02", "2026-05-02"]),  // stale: last seen March-May
      ...mk("Council", 150, ["2026-07-01", "2026-08-01", "2026-09-01"]), // declared below
      ...mk("Tesco", 40, ["2026-09-01", "2026-09-08", "2026-09-15"], "groceries"), // weekly shop
    ],
    recurring: [{ id: 1, active: true, payee: "council", amount: 150, freq: "monthly", dayOfMonth: 1 }],
  };
  const subs = findSubscriptions(state, "2026-09-19");
  const byKey = Object.fromEntries(subs.map((s) => [s.key, s]));

  t.ok("finds the monthly charge", !!byKey.netflix);
  t.eq("...at the right amount and cadence", [byKey.netflix.amount, byKey.netflix.cadence.id], [9.99, "monthly"]);
  t.near("...annualised", byKey.netflix.annual, 119.88);
  t.near("...and per month", byKey.netflix.monthly, 9.99);
  t.eq("...with the occurrence count", byKey.netflix.count, 4);
  t.eq("...and when it was last seen", byKey.netflix.lastSeen, "2026-09-11");
  t.ok("...not flagged stale", byKey.netflix.stale === false);

  t.ok("two charges aren't a subscription", !byKey.spotify);
  t.ok("a declared rule isn't a finding", !byKey.council);
  t.ok("an abandoned charge is still found", !!byKey.adobe);
  t.ok("...but marked stale", byKey.adobe.stale === true);
  t.ok("a weekly shop is found at weekly cadence", byKey.tesco?.cadence.id === "weekly");
  t.near("...annualised over 52 weeks", byKey.tesco.annual, 2080);
  t.eq("biggest annual cost first", subs[0].key, "tesco");

  const totals = subscriptionTotals(subs);
  t.eq("stale charges are counted separately", totals.staleCount, 1);
  t.near("live annual total excludes the stale one", totals.annual, 119.88 + 2080);
  t.eq("live count", totals.count, 2);

  // Posted-from-a-rule entries must never be re-detected.
  const posted = findSubscriptions({
    transactions: mk("Landlord", 900, ["2026-07-01", "2026-08-01", "2026-09-01"], "rent", { recurringId: 7 }),
    recurring: [],
  }, "2026-09-19");
  t.eq("entries posted by a rule are ignored", posted.length, 0);

  // A drifting price is still one charge.
  const drift = findSubscriptions({
    transactions: [
      { id: 1, type: "expense", payee: "Cloud", amount: 10, catId: "subscriptions", date: "2026-06-01" },
      { id: 2, type: "expense", payee: "Cloud", amount: 10, catId: "subscriptions", date: "2026-07-01" },
      { id: 3, type: "expense", payee: "Cloud", amount: 11, catId: "subscriptions", date: "2026-08-01" },
      { id: 4, type: "expense", payee: "Cloud", amount: 11, catId: "subscriptions", date: "2026-09-01" },
    ],
    recurring: [],
  }, "2026-09-19");
  t.ok("a price rise is still the same charge", drift.length === 1);
  t.eq("...and the rise is reported", [drift[0].rose.from, drift[0].rose.to], [10, 11]);

  // A shop with a subscription and one big irregular purchase.
  const mixed = findSubscriptions({
    transactions: [
      ...mk("Amazon", 8.99, ["2026-06-20", "2026-07-20", "2026-08-20", "2026-09-10"], "subscriptions"),
      { id: "big", type: "expense", payee: "Amazon", amount: 640, catId: "shopping", date: "2026-07-22" },
    ],
    recurring: [],
  }, "2026-09-19");
  t.eq("an irregular purchase doesn't drag the figure", mixed[0].amount, 8.99);

  const dismissed = findSubscriptions({ ...state, dismissedSubs: ["netflix"] }, "2026-09-19");
  t.ok("a dismissed charge stays dismissed", !dismissed.some((s) => s.key === "netflix"));

  const rule = ruleFromSubscription(byKey.netflix);
  t.eq("a rule shaped from the charge", [rule.freq, rule.dayOfMonth, rule.amount, rule.type],
    ["monthly", 11, 9.99, "expense"]);
  t.eq("...starting where the charge left off", rule.lastPostedDate, "2026-09-11");
  t.ok("...and active", rule.active === true);
  t.eq("a weekly charge makes a weekly rule",
    [ruleFromSubscription(byKey.tesco).freq, ruleFromSubscription(byKey.tesco).dayOfMonth], ["weekly", null]);

  t.eq("no transactions, no findings", findSubscriptions({}, "2026-09-19").length, 0);
}
