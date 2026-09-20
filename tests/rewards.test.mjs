import { atDate, suite } from "./harness.mjs";
import {
  DEFAULT_REWARD_TYPE, comebackMessage, comebacksToday, freshStart, isLapsed, landmarkFor,
  rewardTaper, rewardTypeOf,
} from "../src/lib/rewards.js";
import { WIDGET_KEY, publishWidget, widgetSnapshot } from "../src/lib/widget.js";
import { newTask, weeklyCountRule, weeklyRule } from "../src/lib/tasks.js";

const t = suite("rewards and widget");

const TODAY = "2026-09-19";
const CLOCK = `${TODAY}T12:00:00`;
const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const habit = (patch) => newTask({
  id: "h1", kind: "build", text: "Morning walk", startDate: "2026-01-01",
  recurrence: weeklyRule(EVERY_DAY), ...patch,
});
const log = (dates, id = "h1") =>
  Object.fromEntries(dates.map((d) => [d, { [id]: { done: true, doneAt: 1 } }]));
const rating = (mean, date = "2026-09-01") => [{ taskId: "h1", date, mean, scores: [mean, mean, mean, mean] }];

t.group("kinds of reward");
{
  // Extrinsic rewards help a habit start but crowd out the motivation they seeded, so the
  // default is the one the habit should end up at.
  t.eq("the default is the thing itself", DEFAULT_REWARD_TYPE, "intrinsic");
  t.eq("...and that's what an unmarked habit gets", rewardTypeOf(habit()), "intrinsic");
  t.eq("a habit with a treat attached is extrinsic whether it said so or not",
    rewardTypeOf(habit({ reward: { text: "New boots", atDays: 30 } })), "extrinsic");
  t.eq("an explicit type wins", rewardTypeOf(habit({ rewardType: "bundled" })), "bundled");
}

t.group("the taper");
{
  const treat = habit({ rewardType: "extrinsic" });
  t.eq("nothing fades while there's no reading to fade against", rewardTaper(treat, []).fade, 0);
  t.ok("a low reading barely fades it", rewardTaper(treat, rating(2.5)).fade < 0.2);
  t.ok("a mid reading fades it halfway", Math.abs(rewardTaper(treat, rating(3.75)).fade - 0.5) < 0.06,
    rewardTaper(treat, rating(3.75)));
  const graduated = rewardTaper(treat, [
    { taskId: "h1", date: "2026-08-01", mean: 6, scores: [6, 6, 6, 6] },
    { taskId: "h1", date: "2026-09-01", mean: 6.2, scores: [6, 6, 6, 7] },
  ]);
  t.ok("a graduated habit keeps none of it", !graduated.active && graduated.fade === 1);
  // Bundling and the thing itself never crowd anything out, so they never fade.
  t.ok("bundled rewards don't taper", rewardTaper(habit({ rewardType: "bundled" }), rating(6.5)).active);
  t.ok("nor does the thing itself", rewardTaper(habit(), rating(6.5)).active);
}

t.group("coming back");
{
  // The Milkman megastudy's top intervention of 54: reward the RETURN, not the streak.
  const oneMiss = comebacksToday([habit()], log(["2026-09-17", TODAY]), {}, TODAY);
  t.eq("a day missed, then back", oneMiss.map((c) => c.missedDays), [1]);
  const threeMisses = comebacksToday([habit()], log(["2026-09-15", TODAY]), {}, TODAY);
  t.eq("a longer gap is counted", threeMisses[0].missedDays, 3);

  t.eq("an unbroken run isn't a comeback",
    comebacksToday([habit()], log(["2026-09-17", "2026-09-18", TODAY]), {}, TODAY).length, 0);
  t.eq("not doing it today isn't a comeback either",
    comebacksToday([habit()], log(["2026-09-15"]), {}, TODAY).length, 0);
  t.eq("a frozen day wasn't a miss",
    comebacksToday([habit()], log(["2026-09-17", TODAY]), { "2026-09-18": true }, TODAY).length, 0);
  t.eq("a one-off can't come back", comebacksToday([newTask({ id: "h1", done: true })], {}, {}, TODAY).length, 0);

  // A habit only scheduled on Saturdays didn't "miss" Sunday through Friday — between the
  // 5th and today there is exactly one Saturday it skipped.
  const weekly = habit({ recurrence: weeklyRule(["sat"]) });
  t.eq("only the days it was actually due count",
    comebacksToday([weekly], log(["2026-09-05", TODAY]), {}, TODAY)[0].missedDays, 1);

  t.ok("one miss is spoken to as one", /whole skill/i.test(comebackMessage(1)));
  t.ok("two has its own words", /relapse/i.test(comebackMessage(2)));
  t.ok("and anything longer has a general one", comebackMessage(9).length > 20);
}

t.group("fresh starts");
{
  t.eq("new year's day", landmarkFor("2027-01-01").id, "year");
  t.eq("the first of a month", landmarkFor("2026-10-01").id, "month");
  t.eq("a Monday", landmarkFor("2026-09-21").id, "week");
  t.eq("an ordinary Wednesday isn't a landmark", landmarkFor("2026-09-23"), null);
  t.eq("a birthday, when one is set", landmarkFor("2026-09-23", "09-23").id, "birthday");

  const drifted = { tasks: [habit()], dayLog: {}, freshStarts: [] };
  const onTrack = {
    tasks: [habit()],
    dayLog: log(["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]),
    freshStarts: [],
  };
  t.ok("nothing kept for days is a drift", isLapsed(drifted.tasks, drifted.dayLog, "2026-09-21"));
  t.ok("keeping them isn't", !isLapsed(onTrack.tasks, onTrack.dayLog, "2026-09-21"));
  t.ok("a new user with no habits hasn't drifted", !isLapsed([], {}, "2026-09-21"));

  // Both gates are required. Dai's own 2018 caveat: a reset offered to someone who is
  // already succeeding demotivates them, so being on track is a reason to stay quiet.
  t.ok("a landmark plus a drift is a prompt", !!freshStart(drifted, "2026-09-21"));
  t.eq("a landmark without a drift says nothing", freshStart(onTrack, "2026-09-21"), null);
  t.eq("a drift without a landmark says nothing", freshStart(drifted, "2026-09-23"), null);
  t.eq("and it's only offered once a day",
    freshStart({ ...drifted, freshStarts: [{ date: "2026-09-21" }] }, "2026-09-21"), null);
  t.ok("the prompt names the landmark", /new week/.test(freshStart(drifted, "2026-09-21").title));
}

t.group("the home-screen snapshot");
atDate(CLOCK, () => {
  const tasks = [
    habit({ id: "h1", text: "Morning walk" }),
    habit({ id: "h2", text: "Read ten pages" }),
    newTask({ id: "t1", text: "Call the bank", dueDate: TODAY }),
    newTask({ id: "t2", text: "A task with a really quite long name that will not fit", dueDate: TODAY }),
    newTask({ id: "t3", text: "Fifth thing", dueDate: TODAY }),
    habit({ id: "h9", text: "Archived", archivedAt: 1 }),
  ];
  const snap = widgetSnapshot({ tasks, dayLog: log([TODAY]), streak: 12 }, TODAY);
  t.eq("today's date", snap.date, TODAY);
  t.eq("what's on and what's done", [snap.total, snap.done], [5, 1]);
  t.eq("the streak comes along", snap.streak, 12);
  // A widget that needs scrolling is an app.
  t.eq("at most four rows", snap.items.length, 4);
  t.ok("long names are cut to fit", snap.items.some((i) => i.text.endsWith("…") && i.text.length <= 28));
  t.ok("each row knows if it's done", snap.items[0].done === true);
  t.ok("archived habits never reach the launcher", !snap.items.some((i) => i.id === "h9"));

  // A quota habit that's met its week has nothing left to ask for, so it drops off.
  const quota = habit({ id: "q1", recurrence: weeklyCountRule(2) });
  const met = widgetSnapshot({ tasks: [quota], dayLog: log(["2026-09-14", "2026-09-16"], "q1") }, TODAY);
  t.eq("a finished quota habit isn't on the widget", met.total, 0);

  t.eq("an empty day is an empty snapshot, not a crash",
    widgetSnapshot({}, TODAY), { date: TODAY, done: 0, total: 0, streak: 0, items: [], updatedAt: Date.parse(CLOCK) });
});

t.group("publishing it");
{
  t.eq("the key the launcher reads", WIDGET_KEY, "momentum:widget");
}
// On the web there is no home screen to draw on, and callers shouldn't have to know that.
const published = await publishWidget({ tasks: [] }, TODAY);
t.ok("publishing off a phone is a quiet no-op that says why",
  published.published === false && published.reason === "not-native", published);
