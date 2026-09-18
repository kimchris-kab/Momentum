import { addDays, formatTime12, todayStr, weekdayKey } from "./date.js";
import { WK_ORDER } from "../data/constants.js";
import { isDone, tasksForDate } from "./tasks.js";
import { missedYesterday } from "./habits.js";
import { reminderMode } from "./automaticity.js";
import { cueOf } from "./cues.js";

// Every nudge the app is allowed to send, in one place. Spec item 15 is blunt about the
// risk here — over-reliance on reminders undermines the habit, and notification fatigue is
// how apps get muted rather than uninstalled. So each kind is individually switchable,
// quiet hours are honoured, and nothing fires that the person hasn't turned on.
export const NUDGE_KINDS = [
  {
    id: "habits",
    label: "Habit reminders",
    desc: "At the time you set on a habit. Withdrawn automatically once a habit graduates.",
    kind: "toggle",
  },
  {
    id: "comeback",
    label: "Never miss twice",
    desc: "One nudge the morning after a missed habit. Missing twice is the single best predictor of quitting.",
    kind: "toggle",
  },
  {
    id: "morning",
    label: "Morning plan",
    desc: "What today is asking of you, before it starts.",
    kind: "time",
    fallback: "07:30",
  },
  {
    id: "evening",
    label: "Evening review",
    desc: "A prompt to log the day while you still remember it.",
    kind: "time",
    fallback: "21:00",
  },
  {
    id: "weekly",
    label: "Weekly planning",
    desc: "Once a week, to set priorities before the week sets them for you.",
    kind: "weekly",
    fallback: { day: "sun", time: "18:00" },
  },
];

export const DEFAULT_NOTIFY = {
  habits: true,
  comeback: true,
  morning: null,        // "HH:MM" when on
  evening: null,
  weekly: null,         // { day, time } when on
  quietStart: "22:00",
  quietEnd: "07:00",
  quiet: true,
};

export const notifySettings = (settings) => ({ ...DEFAULT_NOTIFY, ...(settings?.notify || {}) });

const minutesOf = (t) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Quiet hours wrap midnight, so 22:00–07:00 is "late evening OR early morning", not an
 * empty range. Applies only to nudges the app generates on its own — a reminder at a time
 * you explicitly chose is yours, and silently dropping it would be the app overruling you.
 */
export function inQuietHours(time, notify) {
  if (!notify?.quiet) return false;
  const t = minutesOf(time);
  const start = minutesOf(notify.quietStart);
  const end = minutesOf(notify.quietEnd);
  if (t === null || start === null || end === null) return false;
  if (start === end) return false;
  return start < end ? t >= start && t < end : t >= start || t < end;
}

// Actions offered on the notification itself, so a habit can be ticked without the app.
export const ACTIONS = {
  done: { id: "done", title: "Done" },
  snooze: { id: "snooze", title: "In 15 min" },
  twoMin: { id: "twoMin", title: "Just the tiny bit" },
  open: { id: "open", title: "Open" },
};

const habitBody = (task) => {
  const bits = [];
  const cue = cueOf(task);
  if (task.kind === "break") {
    if (task.competingResponse) bits.push(`Instead: ${task.competingResponse}`);
    else if (task.trigger) bits.push(`Usual trigger: ${task.trigger}`);
    return bits.join(" · ") || "This is the window. Ride it out.";
  }
  // Lead with the plan the person wrote, then the cue, then the tiny version. The clock is
  // the least useful thing to say — they can already see the time.
  if (task.intention) return task.intention;
  if (cue && cue.type !== "time" && cue.detail) {
    bits.push(cue.type === "routine" ? `After you ${cue.detail}` : `When you're ${cue.detail}`);
  }
  if (task.twoMin) bits.push(`Hard day? Just: ${task.twoMin}`);
  if (bits.length) return bits.join(" · ");
  if (task.kind === "todo") {
    const note = (task.notes || "").trim();
    return note ? note.slice(0, 120) : "This is the time you set for it.";
  }
  return "Time to show up for this one.";
};

const actionsFor = (task) => {
  const out = [ACTIONS.done];
  if (task?.twoMin && task.kind === "build") out.push(ACTIONS.twoMin);
  out.push(ACTIONS.snooze);
  return out.slice(0, 3);   // platforms cap visible actions; three is the safe ceiling
};

const at = (dateStr, time) => new Date(`${dateStr}T${time}:00`);

/**
 * Everything due in the next `days`, already filtered for settings, quiet hours, graduation
 * and completion. The scheduler just delivers what this returns.
 */
export function buildNudges(state, { days = 7, now = Date.now() } = {}) {
  const { tasks = [], dayLog = {}, srbai = [], checkins = [], settings = {} } = state;
  const notify = notifySettings(settings);
  const out = [];
  const today = todayStr();

  for (let offset = 0; offset < days; offset++) {
    const date = offset === 0 ? today : addDays(today, offset);

    // --- per-habit reminders at their own time ---
    if (notify.habits) {
      tasksForDate(tasks, date).forEach((t) => {
        if (!t.time || t.reminder === false) return;
        if (reminderMode(t, srbai) === "faded") return;
        if (isDone(t, date, dayLog)) return;
        out.push({
          id: `habit:${t.id}:${date}`,
          kind: "habits",
          taskId: t.id,
          date,
          at: at(date, t.time),
          title: t.text,
          body: habitBody(t),
          actions: actionsFor(t),
        });
      });
    }

    // --- morning plan ---
    if (notify.morning && !inQuietHours(notify.morning, notify)) {
      const due = tasksForDate(tasks, date, "build").length + tasksForDate(tasks, date, "todo").length;
      out.push({
        id: `morning:${date}`,
        kind: "morning",
        date,
        at: at(date, notify.morning),
        title: "Today's plan",
        body: due ? `${due} thing${due === 1 ? "" : "s"} on today. Pick the one that matters most.` : "Nothing scheduled yet — worth deciding before the day decides for you.",
        actions: [ACTIONS.open],
      });
    }

    // --- evening review ---
    if (notify.evening && !inQuietHours(notify.evening, notify)) {
      const logged = checkins.some((c) => c.date === date);
      if (!logged) {
        out.push({
          id: `evening:${date}`,
          kind: "evening",
          date,
          at: at(date, notify.evening),
          title: "How did today go?",
          body: "Two minutes now is worth more than remembering it wrong tomorrow.",
          actions: [ACTIONS.open],
        });
      }
    }

    // --- weekly planning ---
    if (notify.weekly?.time && !inQuietHours(notify.weekly.time, notify)) {
      if (weekdayKey(date) === (notify.weekly.day || "sun")) {
        out.push({
          id: `weekly:${date}`,
          kind: "weekly",
          date,
          at: at(date, notify.weekly.time),
          title: "Plan the week",
          body: "Three priorities beats twenty intentions.",
          actions: [ACTIONS.open],
        });
      }
    }
  }

  // --- never miss twice: today only, and only if something was actually missed ---
  if (notify.comeback) {
    const missed = missedYesterday(tasks, dayLog, state.freezes || {});
    if (missed.length) {
      const when = notify.morning && !inQuietHours(notify.morning, notify) ? notify.morning : "09:00";
      const first = missed[0];
      out.push({
        id: `comeback:${today}`,
        kind: "comeback",
        taskId: first.id,
        date: today,
        at: at(today, when),
        title: missed.length === 1 ? `${first.text} — today's the one that counts` : "Yesterday got away from you",
        body: missed.length === 1
          ? "One miss is nothing. Two in a row is how habits die. Today matters more than yesterday did."
          : `${missed.length} habits missed yesterday. Pick one and do it — never miss twice.`,
        actions: [ACTIONS.done, ACTIONS.open],
      });
    }
  }

  return out
    .filter((n) => n.at.getTime() > now)
    .sort((a, b) => a.at - b.at);
}

export const nextNudge = (nudges) => (nudges.length ? nudges[0] : null);

export const describeNudge = (n) =>
  `${n.title} · ${formatTime12(`${String(n.at.getHours()).padStart(2, "0")}:${String(n.at.getMinutes()).padStart(2, "0")}`)}`;

export const WEEKDAY_OPTIONS = WK_ORDER.map((k) => ({ id: k, label: k[0].toUpperCase() + k.slice(1, 3) }));
