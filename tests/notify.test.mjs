import { suite } from "./harness.mjs";
import {
  cancelAllReminders, deliveryReport, isOurTag, notificationPermission, reminderCapability,
  requestNotificationPermission, scheduleNudges,
} from "../src/lib/notify.js";

const t = suite("notify");

// notify.js decides which of three delivery routes a platform can actually manage, and it
// reads the globals at call time rather than at import — so the platforms can be played
// back here. Node itself is the fourth case: no window at all.
const clearPlatform = () => {
  delete globalThis.window;
  delete globalThis.Notification;
  delete globalThis.navigator;
};

const asNative = ({ display = "granted" } = {}) => {
  const scheduled = [];
  const plugin = {
    checkPermissions: async () => ({ display }),
    requestPermissions: async () => ({ display }),
    registerActionTypes: async () => {},
    schedule: async (arg) => { scheduled.push(...arg.notifications); },
    getPending: async () => ({ notifications: [{ id: 1 }] }),
    cancel: async () => {},
  };
  globalThis.window = { Capacitor: { isNativePlatform: () => true, Plugins: { LocalNotifications: plugin } } };
  return scheduled;
};

const asBrowser = ({ permission = "granted", triggers = false, sw = null } = {}) => {
  class FakeNotification {
    constructor(title, opts) { FakeNotification.sent.push({ title, ...opts }); }
    static permission = permission;
    static requestPermission = async () => permission;
    static sent = [];
  }
  if (triggers) FakeNotification.prototype.showTrigger = null;
  globalThis.Notification = FakeNotification;
  globalThis.TimestampTrigger = class { constructor(at) { this.at = at; } };
  globalThis.window = { Notification: FakeNotification };
  globalThis.navigator = { serviceWorker: sw ? { ready: Promise.resolve(sw) } : undefined };
  return FakeNotification;
};

// A service worker registration that remembers what it was asked to show, and what it closed.
const fakeRegistration = (existing = []) => {
  const shown = [];
  const closed = [];
  const live = existing.map((tag) => ({ tag, close: () => closed.push(tag) }));
  return {
    shown,
    closed,
    getNotifications: async () => live,
    showNotification: async (title, opts) => { shown.push({ title, ...opts }); },
  };
};

const habit = (id, time) => ({
  id, kind: "build", text: `Habit ${id}`, recurrence: { freq: "daily", interval: 1 },
  createdAt: 1, startDate: "2020-01-01", time, remind: true,
});
const stateWith = (tasks, settings = {}) => ({
  tasks, dayLog: {}, checkins: [], srbai: [], freezes: {},
  settings: { notify: { habits: true }, ...settings },
});

t.group("whose notification is this");
{
  // The bug this exists for: every nudge goes out tagged "mtm:", and cancelling only ever
  // closed "habit:". Turning reminders off cancelled nothing and they fired anyway.
  t.ok("a scheduled nudge is ours", isOurTag("mtm:habits:2026-09-21"));
  t.ok("...and so is one an older build left behind", isOurTag("habit:test"));
  t.ok("someone else's notification is left alone", !isOurTag("newsletter:42"));
  t.ok("...and an untagged one is nobody's", !isOurTag(undefined) && !isOurTag(""));
}

t.group("what this platform can manage");
{
  clearPlatform();
  t.eq("no notifications at all on a bare runtime", reminderCapability().level, "none");
  t.eq("...and permission reads as unsupported rather than denied",
    await notificationPermission(), "unsupported");
  t.eq("...and asking is honest about it", await requestNotificationPermission(), "unsupported");

  asBrowser({ permission: "default" });
  t.eq("a plain browser can only manage foreground reminders", reminderCapability().level, "foreground");
  // The weaker guarantee has to be stated, because the difference matters to the user.
  t.ok("...and says what that means", /while the app is open/i.test(reminderCapability().label));
  t.eq("...and reports the browser's own answer", await notificationPermission(), "default");

  asBrowser({ triggers: true });
  t.eq("a browser with triggers can fire while closed", reminderCapability().level, "triggers");
  t.ok("...and says so", /even when the app is closed/i.test(reminderCapability().label));

  asNative();
  t.eq("the installed app gets real alarms", reminderCapability().level, "native");
  t.eq("...and asks the OS for the answer", await notificationPermission(), "granted");

  asNative({ display: "prompt" });
  t.eq("anything that isn't granted or denied is undecided", await notificationPermission(), "default");
  asNative({ display: "denied" });
  t.eq("denied is denied", await notificationPermission(), "denied");
  t.eq("...and requesting reports it rather than pretending",
    await requestNotificationPermission(), "denied");
  clearPlatform();
}

t.group("scheduling by the best route available");
{
  const state = stateWith([habit("h1", "07:00"), habit("h2", "21:00")]);

  const scheduled = asNative();
  const nativeRun = await scheduleNudges(state);
  t.eq("the installed app schedules natively", nativeRun.via, "native");
  t.ok("...and something was actually handed to the OS", scheduled.length > 0);
  t.ok("...with a stable id per nudge, so rescheduling replaces rather than duplicates",
    scheduled.every((n) => Number.isInteger(n.id) && n.id >= 0 && n.id < 2e9));
  t.ok("...and habit reminders carry their actions",
    scheduled.some((n) => n.actionTypeId === "habit"), scheduled.map((n) => n.actionTypeId));
  t.ok("...and enough context to act on without opening the app",
    scheduled.every((n) => n.extra && "taskId" in n.extra && "date" in n.extra));

  const reg = fakeRegistration();
  asBrowser({ triggers: true, sw: reg });
  const trig = await scheduleNudges(state);
  t.eq("a browser with triggers uses them", trig.via, "triggers");
  t.ok("...and every one is tagged as ours", reg.shown.every((n) => isOurTag(n.tag)), reg.shown.map((n) => n.tag));
  t.ok("...and carries a trigger time", reg.shown.every((n) => n.showTrigger));

  // Rescheduling must clear what it is replacing, including what an older build left.
  const stale = fakeRegistration(["mtm:habits:old", "habit:legacy", "newsletter:42"]);
  asBrowser({ triggers: true, sw: stale });
  await scheduleNudges(state);
  t.eq("rescheduling closes our stale notifications", stale.closed.sort(), ["habit:legacy", "mtm:habits:old"]);
  t.ok("...and leaves everyone else's alone", !stale.closed.includes("newsletter:42"));

  clearPlatform();
}

t.group("when it shouldn't schedule at all");
{
  const state = stateWith([habit("h1", "07:00")]);

  asBrowser({ permission: "denied" });
  const denied = await scheduleNudges(state);
  t.eq("without permission nothing is scheduled", denied.scheduled, 0);
  t.eq("...and it says why", denied.via, "unpermitted");
  t.eq("...carrying the permission it found", denied.permission, "denied");

  // Turning reminders off has to cancel what is already out there, not just stop adding.
  const reg = fakeRegistration(["mtm:habits:2026-09-21"]);
  asBrowser({ triggers: true, sw: reg });
  const off = await scheduleNudges(stateWith([habit("h1", "07:00")], { reminders: false }));
  t.eq("switched off means nothing scheduled", off.scheduled, 0);
  t.eq("...and it says so", off.via, "disabled");
  t.eq("...and what was already pending is cancelled", reg.closed, ["mtm:habits:2026-09-21"]);

  const direct = fakeRegistration(["mtm:habits:x", "habit:test", "other:y"]);
  asBrowser({ triggers: true, sw: direct });
  await cancelAllReminders();
  t.eq("cancelling closes both of our tag styles", direct.closed.sort(), ["habit:test", "mtm:habits:x"]);
  clearPlatform();
}

t.group("telling the user what they're actually getting");
{
  asBrowser({ permission: "granted", triggers: true, sw: fakeRegistration() });
  const report = await deliveryReport(stateWith([habit("h1", "07:00")]));
  t.eq("nothing is blocking it", report.blocked, null);
  t.eq("...and the route is named", report.capability.level, "triggers");
  t.ok("...with the next few listed", report.upcoming.length > 0 && report.upcoming.length <= 5);

  asBrowser({ permission: "denied" });
  t.eq("permission is named as the blocker", (await deliveryReport(stateWith([habit("h1", "07:00")]))).blocked,
    "permission");

  asBrowser({ permission: "granted" });
  const offReport = await deliveryReport(stateWith([habit("h1", "07:00")], { reminders: false }));
  t.eq("being switched off is named as the blocker", offReport.blocked, "off");
  t.eq("...and nothing is listed as upcoming", offReport.upcoming.length, 0);

  clearPlatform();
  t.eq("a runtime that can't do it at all says so",
    (await deliveryReport(stateWith([habit("h1", "07:00")]))).blocked, "permission");
}
