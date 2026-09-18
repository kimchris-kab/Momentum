import { isDone, tasksForDate } from "./tasks.js";
import { todayStr } from "./date.js";
import { reminderMode } from "./automaticity.js";
import { cueOf } from "./cues.js";

// Reminders take the best route available:
//   1. Capacitor LocalNotifications on the installed Android app — real OS alarms, survives
//      the app being closed. Injected at runtime, so no bundler import is needed here.
//   2. Notification Triggers in an installed PWA where Chrome supports them — also fires
//      while closed.
//   3. Otherwise in-page timers, which only fire while the app is actually open. That is a
//      genuinely weaker guarantee, so the UI says so rather than pretending otherwise.
const native = () => (typeof window !== "undefined" ? window.Capacitor?.Plugins?.LocalNotifications : null);
const isNative = () => !!(typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() && native());
const hasWebNotification = () => typeof window !== "undefined" && "Notification" in window;
const hasTriggers = () =>
  typeof window !== "undefined" && "Notification" in window && "showTrigger" in Notification.prototype;

export function reminderCapability() {
  if (isNative()) return { level: "native", label: "Alarms work even when the app is closed." };
  if (hasTriggers()) return { level: "triggers", label: "Reminders fire even when the app is closed." };
  if (hasWebNotification()) {
    return { level: "foreground", label: "Reminders fire while the app is open. Install it to the home screen for alarms that work when it's closed." };
  }
  return { level: "none", label: "This browser can't show reminders. Install the app to the home screen." };
}

export async function notificationPermission() {
  if (isNative()) {
    try {
      const r = await native().checkPermissions();
      return r.display === "granted" ? "granted" : r.display === "denied" ? "denied" : "default";
    } catch { return "default"; }
  }
  if (!hasWebNotification()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (isNative()) {
    try {
      const r = await native().requestPermissions();
      return r.display === "granted" ? "granted" : "denied";
    } catch { return "denied"; }
  }
  if (!hasWebNotification()) return "unsupported";
  try { return await Notification.requestPermission(); }
  catch { return "denied"; }
}

const bodyFor = (task) => {
  const bits = [];
  if (task.kind === "break") {
    if (task.trigger) bits.push(`Usual trigger: ${task.trigger}`);
    return bits.join(" · ") || "This is the window. Ride it out.";
  }
  if (task.twoMin) bits.push(`Hard day? Just: ${task.twoMin}`);
  else {
    // Lead with the cue, not the clock — the anchor is what actually starts the behaviour.
    const cue = cueOf(task);
    if (cue && cue.type !== "time" && cue.detail) {
      bits.push(cue.type === "routine" ? `After you ${cue.detail}` : `When you're ${cue.detail}`);
    }
  }
  if (bits.length) return bits.join(" · ");
  if (task.kind === "todo") {
    const note = (task.notes || "").trim();
    return note ? note.slice(0, 120) : "This is the time you set for it.";
  }
  return "Time to show up for this one.";
};

// A stable 31-bit id per habit+time, so rescheduling replaces rather than duplicates
const idFor = (taskId, offsetDays) => {
  let h = 0;
  const s = `${taskId}:${offsetDays}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 2000000000;
};

// Anything with a time on it earns a reminder — a one-off task, a habit you're building, or
// a habit you're avoiding. Setting a time and getting nothing was the interface promising
// something the scheduler never delivered.
function occurrencesWithin(tasks, days, dayLog, srbai) {
  const out = [];
  for (let offset = 0; offset < days; offset++) {
    const date = offset === 0 ? todayStr() : shiftISO(todayStr(), offset);
    tasksForDate(tasks, date).forEach((t) => {
      if (!t.time || t.reminder === false) return;
      // A graduated habit's prompt is withdrawn. Stawarz et al. (2015) found reminders
      // support repetition but hinder habit development — once the cue is doing the work,
      // continuing to ping makes the app the cue again. keepReminder opts back in.
      if (reminderMode(t, srbai) === "faded") return;
      // don't nag about something already ticked off earlier in the day
      if (isDone(t, date, dayLog)) return;
      const at = new Date(`${date}T${t.time}:00`);
      if (at.getTime() <= Date.now()) return;
      out.push({ task: t, date, at, offset });
    });
  }
  return out;
}

function shiftISO(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

let pageTimers = [];
const clearPageTimers = () => { pageTimers.forEach(clearTimeout); pageTimers = []; };

export async function scheduleReminders(tasks, { enabled = true, daysAhead = 7, dayLog = {}, srbai = [] } = {}) {
  clearPageTimers();
  if (!enabled) { await cancelAllReminders(); return { scheduled: 0, via: "disabled" }; }
  if ((await notificationPermission()) !== "granted") return { scheduled: 0, via: "unpermitted" };

  const items = occurrencesWithin(tasks, daysAhead, dayLog, srbai);

  if (isNative()) {
    try {
      await cancelAllReminders();
      await native().schedule({
        notifications: items.map((i) => ({
          id: idFor(i.task.id, i.offset),
          title: i.task.text,
          body: bodyFor(i.task),
          schedule: { at: i.at, allowWhileIdle: true },
          extra: { taskId: i.task.id, date: i.date },
        })),
      });
      return { scheduled: items.length, via: "native" };
    } catch { /* fall through to web */ }
  }

  if (hasTriggers()) {
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg) {
        const existing = await reg.getNotifications({ includeTriggered: false });
        existing.forEach((n) => n.tag?.startsWith("habit:") && n.close());
        for (const i of items) {
          await reg.showNotification(i.task.text, {
            body: bodyFor(i.task),
            tag: `habit:${i.task.id}:${i.date}`,
            // eslint-disable-next-line no-undef
            showTrigger: new TimestampTrigger(i.at.getTime()),
            data: { taskId: i.task.id, date: i.date },
          });
        }
        return { scheduled: items.length, via: "triggers" };
      }
    } catch { /* fall through */ }
  }

  // Foreground-only fallback: fire while this page stays open
  const soon = items.filter((i) => i.at.getTime() - Date.now() < 12 * 3600 * 1000);
  soon.forEach((i) => {
    pageTimers.push(setTimeout(() => {
      try { new Notification(i.task.text, { body: bodyFor(i.task), tag: `habit:${i.task.id}` }); }
      catch { /* ignore */ }
    }, Math.max(0, i.at.getTime() - Date.now())));
  });
  return { scheduled: soon.length, via: "foreground" };
}

export async function cancelAllReminders() {
  clearPageTimers();
  if (isNative()) {
    try {
      const pending = await native().getPending();
      if (pending?.notifications?.length) await native().cancel({ notifications: pending.notifications });
    } catch { /* ignore */ }
    return;
  }
  try {
    const reg = await navigator.serviceWorker?.ready;
    const existing = await reg?.getNotifications({ includeTriggered: true });
    existing?.forEach((n) => n.tag?.startsWith("habit:") && n.close());
  } catch { /* ignore */ }
}

// Immediate nudge used by the "remind me later" action and for testing the setup
export async function sendTestReminder(title = "Momentum", body = "Reminders are working.") {
  if ((await notificationPermission()) !== "granted") return false;
  if (isNative()) {
    try {
      await native().schedule({
        notifications: [{ id: Math.floor(Math.random() * 1e9), title, body, schedule: { at: new Date(Date.now() + 1000) } }],
      });
      return true;
    } catch { return false; }
  }
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) await reg.showNotification(title, { body, tag: "habit:test" });
    else new Notification(title, { body });
    return true;
  } catch { return false; }
}
