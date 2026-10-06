import { suite } from "./harness.mjs";
import { SHADE_MODES, bestPastRunMs, pinnedHabit, setShadePin, shadeHabit, shadeSettings, shadeSnapshot } from "../src/lib/shade.js";
import { newTask, weeklyRule } from "../src/lib/tasks.js";
import { startedAt } from "../src/lib/urges.js";

const t = suite("shade");

// The habit that gets the notification. The rules worth pinning down: only one habit, the most
// recent pin wins (so two phones can't leave two), nothing is shown unless asked for, and a
// habit that has finished or been archived never holds the shade.
const DAY = 86400000;
const NOW = new Date("2026-10-06T08:00:00").getTime();
const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const quit = (id, patch = {}) => newTask({
  id, kind: "break", text: id, startDate: "2026-09-01", createdAt: new Date("2026-09-01T00:00:00").getTime(),
  recurrence: weeklyRule(EVERY_DAY), ...patch,
});
const lapse = (taskId, daysAgo) => ({ id: `l-${taskId}-${daysAgo}`, taskId, kind: "lapse", at: NOW - daysAgo * DAY, date: new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10) });
const st = (patch = {}) => ({ tasks: [quit("a"), quit("b")], urgeLog: [], settings: {}, ...patch });

t.group("settings");
{
  t.eq("a fresh install: on, pinned, name hidden on the lock screen", shadeSettings(undefined), { on: true, mode: "pinned", hideOnLock: true });
  t.eq("an empty settings object means the same", shadeSettings({}), shadeSettings(undefined));
  t.ok("turning the lock-screen privacy off is respected", shadeSettings({ shade: { hideOnLock: false } }).hideOnLock === false);
  t.ok("anything other than an explicit off keeps it on", shadeSettings({ shade: { on: undefined } }).on === true && shadeSettings({ shade: { on: false } }).on === false);
  t.eq("an unknown mode falls back rather than breaking the shade", shadeSettings({ shade: { mode: "random" } }).mode, "pinned");
  t.eq("three ways to choose", SHADE_MODES.map((m) => m.id), ["pinned", "risk", "longest"]);
}

t.group("pinning");
{
  t.eq("nothing pinned, nothing shown", pinnedHabit(st().tasks), null);
  t.eq("a pinned habit is the one", pinnedHabit([quit("a", { shadePin: 5 }), quit("b")])?.id, "a");
  t.eq("the most recent pin wins when two exist", pinnedHabit([quit("a", { shadePin: 5 }), quit("b", { shadePin: 9 })])?.id, "b");
  t.eq("...whichever order they're listed in", pinnedHabit([quit("b", { shadePin: 9 }), quit("a", { shadePin: 5 })])?.id, "b");
  t.eq("a habit being built can't hold it", pinnedHabit([quit("a", { shadePin: 5, kind: "build" })]), null);
  t.eq("an archived habit can't hold it", pinnedHabit([quit("a", { shadePin: 5, archivedAt: 1 })]), null);
  t.eq("a finished habit can't hold it", pinnedHabit([quit("a", { shadePin: 5, endedOn: "2026-10-01" })]), null);

  const pinned = setShadePin([quit("a"), quit("b", { shadePin: 5 })], "a", true, 100);
  t.eq("pinning stamps the habit", pinned.find((x) => x.id === "a").shadePin, 100);
  t.eq("...and that outranks the older pin without touching it", [pinned.find((x) => x.id === "b").shadePin, pinnedHabit(pinned).id], [5, "a"]);
  const unpinned = setShadePin(pinned, "a", false);
  t.ok("unpinning removes the stamp, not just zeroes it", !("shadePin" in unpinned.find((x) => x.id === "a")));
  t.eq("so the older pin is the one again", pinnedHabit(unpinned).id, "b");
  t.ok("other habits are the same objects", setShadePin(pinned, "a", false)[1] === pinned[1]);
}

t.group("which habit, by mode");
{
  const base = st({ tasks: [quit("a", { shadePin: 1 }), quit("b")], urgeLog: [lapse("a", 1), lapse("b", 5)] });
  t.eq("pinned mode shows the pin", shadeHabit(base, NOW)?.id, "a");
  t.eq("pinned mode with no pin shows nothing", shadeHabit(st(), NOW), null);
  t.eq("switched off shows nothing even with a pin", shadeHabit({ ...base, settings: { shade: { on: false } } }, NOW), null);
  const longest = { ...base, settings: { shade: { mode: "longest" } } };
  t.eq("longest mode takes the habit furthest from its last slip (b slipped 5 days ago, a yesterday)", shadeHabit(longest, NOW)?.id, "b");
  t.eq("longest mode needs no pin", shadeHabit({ ...longest, tasks: [quit("a"), quit("b")] }, NOW)?.id, "b");
  t.eq("a habit that never slipped runs from when it started", shadeHabit({ ...longest, urgeLog: [lapse("b", 5)], tasks: [quit("a", { startDate: "2026-08-01", createdAt: new Date("2026-08-01T00:00:00").getTime() }), quit("b")] }, NOW)?.id, "a");

  const risky = { ...base, settings: { shade: { mode: "risk" } } };
  const level = (map) => (task) => map[task.id] || "calm";
  t.eq("risk mode takes the habit in a hard stretch", shadeHabit(risky, NOW, { riskLevel: level({ b: "high" }) })?.id, "b");
  t.eq("high outranks rising", shadeHabit(risky, NOW, { riskLevel: level({ a: "rising", b: "high" }) })?.id, "b");
  t.eq("rising counts", shadeHabit(risky, NOW, { riskLevel: level({ b: "rising" }) })?.id, "b");
  t.eq("when everything is calm it keeps the pinned one rather than flicking about", shadeHabit(risky, NOW, { riskLevel: level({}) })?.id, "a");
  t.eq("calm and nothing pinned falls back to the longest run", shadeHabit({ ...risky, tasks: [quit("a"), quit("b")] }, NOW, { riskLevel: level({}) })?.id, "b");
  t.eq("without the radar loaded it falls back the same way", shadeHabit(risky, NOW)?.id, "a");
  t.eq("no habits to quit, nothing to show", shadeHabit({ tasks: [], urgeLog: [], settings: { shade: { mode: "longest" } } }, NOW), null);
}

t.group("the best run");
{
  const task = quit("a", { startDate: "2026-09-01", createdAt: new Date("2026-09-01T00:00:00").getTime() });
  t.eq("never slipped: no completed run to beat", bestPastRunMs(task, []), 0);
  const start = startedAt(task);
  const slips = [{ id: "1", taskId: "a", kind: "lapse", at: start + 10 * DAY, date: "2026-09-11" }, { id: "2", taskId: "a", kind: "lapse", at: start + 14 * DAY, date: "2026-09-15" }];
  t.eq("the longest stretch between the start and the slips", bestPastRunMs(task, slips), 10 * DAY);
  t.eq("another habit's slips don't count", bestPastRunMs(task, [{ ...slips[0], taskId: "x" }]), 0);
  t.eq("the run in progress isn't counted", bestPastRunMs(task, [slips[1]]), 14 * DAY);
  const undated = quit("u", { startDate: null, createdAt: 0 });
  const two = [{ id: "1", taskId: "u", kind: "lapse", at: 5 * DAY, date: "1970-01-06" }, { id: "2", taskId: "u", kind: "lapse", at: 8 * DAY, date: "1970-01-09" }];
  t.eq("a habit with no known start isn't credited with a run since 1970", bestPastRunMs(undated, two), 3 * DAY);
  t.eq("a later, longer stretch wins", bestPastRunMs(task, [...slips, { id: "3", taskId: "a", kind: "lapse", at: start + 30 * DAY, date: "2026-10-01" }]), 16 * DAY);
}

t.group("the snapshot");
{
  const state = st({ tasks: [quit("a", { shadePin: 1, text: "Doomscrolling" }), quit("b")], urgeLog: [lapse("a", 4), { id: "u", taskId: "a", kind: "urge", outcome: "rode-out", at: NOW - 2 * DAY, date: "2026-10-04" }] });
  const snap = shadeSnapshot(state, NOW, { usualWindow: () => ({ startMin: 1260, endMin: 1350 }) });
  t.ok("it says to show", snap.show === true);
  t.eq("the habit and its name", [snap.id, snap.name], ["a", "Doomscrolling"]);
  t.eq("the last slip goes as a timestamp, not elapsed text", snap.lastSlipAt, NOW - 4 * DAY);
  t.eq("the last urge is the later urge, not the slip", snap.lastUrgeAt, NOW - 2 * DAY);
  t.ok("it records that there has been a slip", snap.everSlipped === true);
  t.eq("the usual window is passed along", snap.risk, { startMin: 1260, endMin: 1350 });
  t.ok("the lock screen hides the name unless told otherwise", snap.hideOnLock === true);
  t.ok("...and shows it if told", shadeSnapshot({ ...state, settings: { shade: { hideOnLock: false } } }, NOW).hideOnLock === false);
  t.ok("no radar, no window, and nothing broke", shadeSnapshot(state, NOW).risk === null);
  const none = shadeSnapshot(st(), NOW);
  t.eq("nothing pinned: an explicit 'don't show', so a stale one gets taken down", [none.show, none.id], [false, undefined]);
  const long = shadeSnapshot(st({ tasks: [quit("a", { shadePin: 1, text: "x".repeat(60) })] }), NOW);
  t.ok("a long name is cut so the notification stays one line", long.name.length === 40 && long.name.endsWith("…"));
  t.ok("never slipped is recorded as never slipped", shadeSnapshot(st({ tasks: [quit("a", { shadePin: 1 })] }), NOW).everSlipped === false);
}
