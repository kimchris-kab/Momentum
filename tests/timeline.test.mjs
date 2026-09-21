import { atDate, suite } from "./harness.mjs";
import {
  DEFAULT_BLOCK_MIN, MIN_GAP_MIN, buildTimeline, fmtGap, minutesOf, nowMinutes, suggestSlots,
  taskDuration, timeOf,
} from "../src/lib/timeline.js";

const t = suite("timeline");

const DAY = "2026-09-21";
const CLOCK = `${DAY}T09:00:00`;

let n = 0;
const task = (time, patch = {}) => ({
  id: `t${++n}`, text: `Task ${n}`, kind: "todo", time, dueDate: DAY, ...patch,
});
const kinds = (items) => items.map((i) => i.kind);
const gaps = (items) => items.filter((i) => i.kind === "gap").map((g) => [timeOf(g.start), g.minutes]);

t.group("reading and writing times");
{
  t.eq("a time is minutes past midnight", minutesOf("07:30"), 450);
  t.eq("midnight is zero", minutesOf("00:00"), 0);
  t.eq("no time, no minutes", minutesOf(null), null);
  t.eq("and back again", timeOf(450), "07:30");
  t.eq("...padded", timeOf(65), "01:05");
  // A block running past midnight has to name a real time rather than "24:30".
  t.eq("past midnight wraps rather than overflowing", timeOf(1470), "00:30");

  t.eq("an untimed task still takes half an hour", taskDuration({}), DEFAULT_BLOCK_MIN);
  t.eq("...and a timed one takes what it says", taskDuration({ timerMinutes: 45 }), 45);
  // Zero would render as a block with no height and no meaning.
  t.eq("nothing is shorter than five minutes", taskDuration({ timerMinutes: 0 }), DEFAULT_BLOCK_MIN);
  t.eq("...not even explicitly", taskDuration({ timerMinutes: 1 }), 5);

  t.eq("gaps read in plain words", fmtGap(45), "45 min free");
  t.eq("...rounding up to hours", fmtGap(120), "2h free");
  t.eq("...and mixing the two", fmtGap(95), "1h 35m free");
  t.eq("the clock reads from a date", nowMinutes(new Date(2026, 8, 21, 14, 45)), 885);
}

t.group("the shape of a day");
atDate(CLOCK, () => {
  const day = buildTimeline([
    task("09:00", { timerMinutes: 60 }),
    task("14:00", { timerMinutes: 30 }),
  ], "2026-09-20", {});   // not today, so no now-marker in the way

  t.eq("blocks and the gap between them", kinds(day.items), ["task", "gap", "task"]);
  t.eq("...with the gap measured end to start", gaps(day.items), [["10:00", 240]]);
  t.eq("busy time is the blocks", day.busyMinutes, 90);
  t.eq("free time is the gaps", day.freeMinutes, 240);
  t.eq("the day starts at the first block", timeOf(day.firstStart), "09:00");
  t.eq("...and ends at the last one's end", timeOf(day.lastEnd), "14:30");

  // Changeover is not free time.
  t.eq("the shortest gap worth showing", MIN_GAP_MIN, 20);
  const tight = buildTimeline([
    task("09:00", { timerMinutes: 30 }), task("09:40", { timerMinutes: 30 }),
  ], "2026-09-20", {});
  t.eq("ten minutes between blocks isn't a gap", kinds(tight.items), ["task", "task"]);
  t.eq("...and isn't counted as free", tight.freeMinutes, 0);

  t.eq("untimed tasks are held separately",
    buildTimeline([task("09:00"), task(null)], "2026-09-20", {}).unscheduled.length, 1);
  t.eq("an archived task isn't on the day at all",
    buildTimeline([task("09:00", { archivedAt: 1 })], "2026-09-20", {}).items, []);
  t.eq("an empty day has no first or last", buildTimeline([], "2026-09-20", {}).firstStart, null);
});

t.group("two things pinned to the same time");
atDate(CLOCK, () => {
  const clash = buildTimeline([
    task("09:00", { timerMinutes: 60 }), task("09:30", { timerMinutes: 30 }),
  ], "2026-09-20", {});
  t.ok("the collision is shown, not hidden",
    clash.items.some((i) => i.kind === "task" && i.overlap), kinds(clash.items));

  // A long block with two short ones inside it: the second short one starts after the first
  // ends, but the long one is still running, so the time between them is not free.
  const nested = buildTimeline([
    task("09:00", { timerMinutes: 180 }),   // 09:00–12:00
    task("09:30", { timerMinutes: 30 }),    // 09:30–10:00
    task("11:00", { timerMinutes: 30 }),    // 11:00–11:30, inside the long block
  ], "2026-09-20", {});
  t.eq("no free gap is invented inside a block that's still running", gaps(nested.items), []);
  t.eq("...and it is still counted as busy, not free", nested.freeMinutes, 0);
  t.ok("...and the overlap is flagged on the block that overlaps",
    nested.items.filter((i) => i.kind === "task" && i.overlap).length === 2,
    nested.items.filter((i) => i.kind === "task").map((i) => [timeOf(i.start), i.overlap]));
});

t.group("where you are in the day");
atDate(CLOCK, () => {
  const marker = (items) => items.findIndex((i) => i.kind === "now");

  const midGap = buildTimeline([
    task("08:00", { timerMinutes: 30 }), task("15:00", { timerMinutes: 30 }),
  ], DAY, {}, 10 * 60);
  // The gap is trimmed to start at now, so the marker belongs in front of it: "you are here,
  // and five hours of it are still ahead".
  t.eq("the marker opens the gap it falls in", kinds(midGap.items), ["task", "now", "gap", "task"]);
  // Otherwise "7h free" sits above a marker saying it is already ten o'clock.
  t.eq("...and the gap shows only what's left of it", gaps(midGap.items), [["10:00", 300]]);
  t.eq("...which is also what's still ahead", midGap.freeAhead, 300);

  const during = buildTimeline([
    task("09:00", { timerMinutes: 60 }), task("15:00", { timerMinutes: 30 }),
  ], DAY, {}, 9 * 60 + 30);
  t.eq("a task in progress keeps the marker after it", kinds(during.items).slice(0, 2), ["task", "now"]);

  const ahead = buildTimeline([task("15:00", { timerMinutes: 30 })], DAY, {}, 9 * 60);
  t.eq("a day not started yet has the marker first", marker(ahead.items), 0);

  const over = buildTimeline([task("08:00", { timerMinutes: 30 })], DAY, {}, 20 * 60);
  t.eq("a day already done has it last", marker(over.items), over.items.length - 1);
  t.eq("...with nothing free ahead", over.freeAhead, 0);

  t.eq("another day gets no marker at all",
    kinds(buildTimeline([task("09:00")], "2026-09-20", {}, 10 * 60).items), ["task"]);
});

t.group("where something could go");
atDate(CLOCK, () => {
  const slots = (tasks, duration, now) =>
    suggestSlots(tasks, DAY, duration, now).map((s) => s.time);

  // 09:00 now, nothing booked: the first suggestion is the next quarter hour with a
  // margin, not "right this second".
  t.eq("the first slot is the next usable quarter hour",
    slots([], 30, 9 * 60)[0], "09:15");
  t.eq("...and there are three of them", slots([], 30, 9 * 60).length, 3);

  t.eq("a slot is offered before the next thing booked",
    slots([task("11:00", { timerMinutes: 60 })], 30, 9 * 60)[0], "09:15");
  // 30 minutes doesn't fit between 09:15 and a 09:30 block.
  t.eq("...but not one that wouldn't fit",
    slots([task("09:30", { timerMinutes: 60 })], 30, 9 * 60)[0], "10:30");

  t.ok("nothing is ever suggested in the past",
    slots([], 30, 16 * 60).every((s) => minutesOf(s) > 16 * 60), slots([], 30, 16 * 60));
  // A suggestion has to finish inside the day, not merely start inside it.
  t.ok("nothing is suggested that runs past the evening",
    slots([task("23:30")], 60, 21 * 60 + 40).every((s) => minutesOf(s) + 60 <= 22 * 60),
    slots([task("23:30")], 60, 21 * 60 + 40));
  t.eq("late enough and there is nothing honest to offer", slots([], 60, 21 * 60 + 30), []);

  t.eq("another day starts in the morning, not at the current time",
    suggestSlots([], "2026-09-22", 30, 9 * 60)[0].time, "08:00");
  t.eq("...and reads as a time a person would say",
    suggestSlots([], "2026-09-22", 30, 9 * 60)[0].label, "8:00 AM");
});
