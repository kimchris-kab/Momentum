import { atDate, suite } from "./harness.mjs";
import { applyWidgetTicks, widgetSnapshot } from "../src/lib/widget.js";
import { amountLabel, spendGlance, virtueGlance, weekDots, widgetExtras } from "../src/lib/widgetExtras.js";
import { answered, chooseVirtue } from "../src/lib/virtue.js";
import { emptyState } from "../src/lib/migrate.js";

const t = suite("widgetExtras");

const TODAY = "2026-10-12";
const CLOCK = `${TODAY}T15:00:00`;
const daily = { freq: "daily", interval: 1, weekdays: [], monthDay: null };
const build = (id, text) => ({ id, kind: "build", text, recurrence: daily, startDate: "2026-09-01", createdAt: 1, order: 1 });
const quit = (id, text) => ({ id, kind: "break", text, recurrence: daily, startDate: "2026-09-01", createdAt: 1, order: 1 });
const spend = (id, date, amount, payee, catId = "dining") => ({ id, type: "expense", amount, date, payee, catId });
const base = (over = {}) => ({ ...emptyState(), ...over });

t.group("ticking from the widget");
{
  const tasks = [build("a", "Walk"), build("b", "Read"), { id: "t1", kind: "todo", text: "Pay rent", dueDate: TODAY, createdAt: 1, order: 1 }];
  const s0 = base({ tasks });
  const s1 = applyWidgetTicks(s0, [{ taskId: "a", date: TODAY, done: true }]);
  t.eq("a tick lands in the day's log", s1.dayLog[TODAY]?.a?.done, true);
  t.eq("...and nothing else changes", s1.dayLog[TODAY]?.b, undefined);
  t.ok("the same tick again changes nothing at all", applyWidgetTicks(s1, [{ taskId: "a", date: TODAY, done: true }]) === s1);
  const s2 = applyWidgetTicks(s1, [{ taskId: "a", date: TODAY, done: false }]);
  t.eq("an untick takes it back", s2.dayLog[TODAY]?.a?.done, undefined);
  const s3 = applyWidgetTicks(s0, [{ taskId: "a", date: TODAY, done: true }, { taskId: "a", date: TODAY, done: false }, { taskId: "a", date: TODAY, done: true }]);
  t.eq("a task tapped three times ends where the last tap left it", s3.dayLog[TODAY]?.a?.done, true);
  t.ok("a task that has since been deleted is skipped", applyWidgetTicks(s0, [{ taskId: "gone", date: TODAY, done: true }]) === s0);
  const todo = applyWidgetTicks(s0, [{ taskId: "t1", date: TODAY, done: true }]);
  t.eq("a one-off task is ticked on the task itself", todo.tasks.find((x) => x.id === "t1").done, true);
  const slipped = base({ tasks: [build("a", "Walk")], dayLog: { [TODAY]: { a: { done: false, slipped: true, at: 1 } } } });
  t.ok("a slipped day is not made clean by a tick", applyWidgetTicks(slipped, [{ taskId: "a", date: TODAY, done: true }]).dayLog[TODAY].a.slipped === true);
}

t.group("how the week went");
atDate(CLOCK, () => {
  const tasks = [build("a", "Walk"), build("b", "Read")];
  const dayLog = {
    "2026-10-06": { a: { done: true }, b: { done: true } },   // all
    "2026-10-07": { a: { done: true } },                      // half
    "2026-10-08": {},                                         // none
    "2026-10-09": { a: { done: true }, b: { done: true } },
    "2026-10-10": { a: { done: true } },
    "2026-10-11": {},
  };
  t.eq("seven days, oldest first, ending today", weekDots(base({ tasks, dayLog }), TODAY), [3, 2, 0, 3, 2, 0, 0]);
  t.eq("days before a habit existed are not counted", weekDots(base({ tasks: [{ ...build("a", "Walk"), startDate: "2026-10-12" }] }), TODAY), [-1, -1, -1, -1, -1, -1, 0]);
  t.eq("no habits, no dots", weekDots(base(), TODAY), [-1, -1, -1, -1, -1, -1, -1]);
});

t.group("what is spent, and what is usual");
{
  t.eq("amounts drop needless decimals", [amountLabel(3), amountLabel(3.5), amountLabel(12.345)], ["3", "3.5", "12.35"]);
  const tx = [
    spend(1, "2026-10-12", 3, "Coffee"), spend(2, "2026-10-10", 3, "Coffee"), spend(3, "2026-10-05", 3, "coffee"),
    spend(4, "2026-10-11", 12, "Lunch", "dining"), spend(5, "2026-10-04", 12, "Lunch", "dining"),
    spend(6, "2026-10-02", 40, "Once only"),
    spend(7, "2026-10-12", 20, "", "transport"), spend(8, "2026-10-01", 20, "", "transport"),
    { id: 9, type: "income", amount: 500, date: "2026-10-12", payee: "Salary", catId: "salary" },
    spend(10, "2026-06-01", 9, "Old", "dining"), spend(11, "2026-06-02", 9, "Old", "dining"),
  ];
  const g = spendGlance(base({ transactions: tx }), TODAY);
  t.eq("today's total counts spending only", g.today, 23);
  t.eq("a usual payment is the same payee for the same amount, more than once", g.chips.map((c) => c.label), ["Coffee 3", "Transport 20", "Lunch 12"]);
  t.eq("a chip carries what it takes to log it again", g.chips[0], { label: "Coffee 3", amount: 3, catId: "dining", payee: "Coffee" });
  t.ok("a payment made once is not offered", !g.chips.some((c) => /Once/.test(c.label)));
  t.ok("a payment from months ago is not offered", !g.chips.some((c) => /Old/.test(c.label)));
  t.eq("at most three", spendGlance(base({ transactions: [...tx, spend(20, "2026-10-12", 7, "Tea"), spend(21, "2026-10-11", 7, "Tea"), spend(22, "2026-10-10", 7, "Tea"), spend(23, "2026-10-09", 7, "Tea")] }), TODAY).chips.length, 3);
  t.eq("nothing spent and nothing usual says nothing", spendGlance(base(), TODAY), null);
  t.eq("only today's spending, no chips yet, still shows the total", spendGlance(base({ transactions: [spend(1, TODAY, 5, "Bus")] }), TODAY), { today: 5, chips: [] });
}

t.group("today's virtue");
{
  const s0 = base({ virtue: chooseVirtue("patience", "2026-10-10") });
  const v = virtueGlance(s0, TODAY);
  t.ok("a virtue being worked on is a line with its name", v && v.line.startsWith("Patience · "), v);
  t.eq("the question is open until it is answered", v.ask, true);
  t.eq("...from two hours before the evening time", v.askFromMin, 20 * 60 + 30 - 120);
  const s1 = answered(s0, { date: TODAY, score: 2 });
  const v1 = virtueGlance(s1, TODAY);
  t.eq("answered, the line says how it went", v1.line, "Patience · Lived it today");
  t.eq("...and the question closes", v1.ask, false);
  t.eq("no virtue, no row", virtueGlance(base(), TODAY), null);
  t.eq("turned off, no row", virtueGlance({ ...s0, settings: { ...s0.settings, virtue: { on: false } } }, TODAY), null);
  t.eq("an evening time the person chose moves the window", virtueGlance({ ...s0, settings: { ...s0.settings, virtue: { evening: "22:00" } } }, TODAY).askFromMin, 20 * 60);
}

t.group("what the snapshot carries");
atDate(CLOCK, () => {
  const s = base({
    tasks: [build("a", "Walk"), quit("q1", "Doomscrolling")],
    virtue: chooseVirtue("patience", "2026-10-10"),
    transactions: [spend(1, TODAY, 3, "Coffee"), spend(2, "2026-10-10", 3, "Coffee")],
  });
  const snap = widgetSnapshot(s, TODAY, { extras: widgetExtras(s, TODAY) });
  t.eq("a week of seven dots", snap.week.length, 7);
  t.eq("the spend glance", snap.spend.chips[0].label, "Coffee 3");
  t.eq("the virtue line", snap.virtue.name, "Patience");
  t.ok("each habit being quit says which red zones have ended", Array.isArray(snap.quitting[0].zoneEnds));
  const plain = widgetSnapshot(s, TODAY);
  t.ok("without the extras the snapshot is what it always was", !("week" in plain) && !("spend" in plain) && !("virtue" in plain) && !("zoneEnds" in plain.quitting[0]));
});
