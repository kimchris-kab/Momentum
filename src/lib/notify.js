import { buildNudges, notifySettings } from "./nudges.js";

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

// Delivery. What to send is decided by buildNudges; this only gets it there, by the best
// route the platform allows, and reports honestly which one that was.
let pageTimers = [];
const clearPageTimers = () => { pageTimers.forEach(clearTimeout); pageTimers = []; };

// A stable 31-bit id per nudge, so rescheduling replaces rather than duplicates.
const idFor = (key) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % 2000000000;
};

// Native action types have to be registered once, up front, before any notification can
// offer them.
let actionTypesReady = false;
async function ensureActionTypes() {
  if (actionTypesReady || !isNative()) return;
  try {
    await native().registerActionTypes({
      types: [
        { id: "habit", actions: [
          { id: "done", title: "Done" },
          { id: "twoMin", title: "Just the tiny bit" },
          { id: "snooze", title: "In 15 min" },
        ] },
        { id: "simple", actions: [{ id: "open", title: "Open" }] },
      ],
    });
    actionTypesReady = true;
  } catch { /* older plugin versions simply show no actions */ }
}

export async function scheduleNudges(state, { daysAhead = 7 } = {}) {
  clearPageTimers();
  const notify = notifySettings(state.settings);
  const enabled = state.settings?.reminders !== false;
  if (!enabled) { await cancelAllReminders(); return { scheduled: 0, via: "disabled", next: null }; }

  const permission = await notificationPermission();
  if (permission !== "granted") return { scheduled: 0, via: "unpermitted", next: null, permission };

  const items = buildNudges(state, { days: daysAhead });
  const next = items[0] || null;

  if (isNative()) {
    try {
      await ensureActionTypes();
      await cancelAllReminders();
      await native().schedule({
        notifications: items.map((n) => ({
          id: idFor(n.id),
          title: n.title,
          body: n.body,
          schedule: { at: n.at, allowWhileIdle: true },
          actionTypeId: n.kind === "habits" || n.kind === "comeback" ? "habit" : "simple",
          extra: { taskId: n.taskId || null, date: n.date, kind: n.kind },
        })),
      });
      return { scheduled: items.length, via: "native", next, permission };
    } catch { /* fall through to web */ }
  }

  if (hasTriggers()) {
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg) {
        const existing = await reg.getNotifications({ includeTriggered: false });
        existing.forEach((n) => n.tag?.startsWith("mtm:") && n.close());
        for (const n of items) {
          await reg.showNotification(n.title, {
            body: n.body,
            tag: `mtm:${n.id}`,
            actions: (n.actions || []).map((a) => ({ action: a.id, title: a.title })),
            // eslint-disable-next-line no-undef
            showTrigger: new TimestampTrigger(n.at.getTime()),
            data: { taskId: n.taskId || null, date: n.date, kind: n.kind },
          });
        }
        return { scheduled: items.length, via: "triggers", next, permission };
      }
    } catch { /* fall through */ }
  }

  // Foreground-only fallback: fires while this page stays open, and only that.
  const soon = items.filter((n) => n.at.getTime() - Date.now() < 12 * 3600 * 1000);
  soon.forEach((n) => {
    pageTimers.push(setTimeout(async () => {
      try {
        const reg = await navigator.serviceWorker?.ready;
        if (reg) {
          await reg.showNotification(n.title, {
            body: n.body,
            tag: `mtm:${n.id}`,
            actions: (n.actions || []).map((a) => ({ action: a.id, title: a.title })),
            data: { taskId: n.taskId || null, date: n.date, kind: n.kind },
          });
          return;
        }
        new Notification(n.title, { body: n.body, tag: `mtm:${n.id}` });
      } catch { /* ignore */ }
    }, Math.max(0, n.at.getTime() - Date.now())));
  });
  return { scheduled: soon.length, via: "foreground", next, permission, pending: items.length };
}

// Kept for callers that still pass a task list; the nudge model is the real entry point.
export const scheduleReminders = (tasks, opts = {}) =>
  scheduleNudges({
    tasks,
    dayLog: opts.dayLog || {},
    srbai: opts.srbai || [],
    checkins: opts.checkins || [],
    freezes: opts.freezes || {},
    settings: { reminders: opts.enabled !== false, notify: opts.notify },
  }, { daysAhead: opts.daysAhead || 7 });

/** What the user is actually getting, for the settings screen — no guessing. */
export async function deliveryReport(state) {
  const capability = reminderCapability();
  const permission = await notificationPermission();
  const notify = notifySettings(state.settings);
  const items = state.settings?.reminders === false ? [] : buildNudges(state, { days: 7 });
  return {
    capability,
    permission,
    notify,
    upcoming: items.slice(0, 5),
    total: items.length,
    blocked: state.settings?.reminders === false ? "off"
      : permission !== "granted" ? "permission"
      : capability.level === "none" ? "unsupported"
      : null,
  };
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
