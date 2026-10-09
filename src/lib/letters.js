import { addDays, dstr } from "./date.js";
import { cleanDays } from "./pep.js";
import { lastSlipAt } from "./urges.js";

// Letters to yourself. Written now, in your own words, and delivered when they are needed:
//   later      — on a date you choose ("open in three months");
//   milestone  — on day N clean of a habit you are quitting;
//   when       — kept until you ask for it, for a moment you can name ("when I want to slip").
// Everything here is plain data. The screens show it and the notifications schedule it.

const DAY = 86400000;
export const MAX_LETTER = 2000;

export const WHEN = [
  { id: "urge", label: "When I want to give in", hint: "Shown on the urge screen, the moment you need it." },
  { id: "temper", label: "When I'm about to lose my temper", hint: "Shown when you press Pause first." },
  { id: "low", label: "When I feel stuck or low", hint: "Kept in your letters, for a heavy day." },
];
export const WHEN_BY_ID = Object.fromEntries(WHEN.map((w) => [w.id, w]));

export const DELAYS = [
  { id: "week", label: "In a week", days: 7 },
  { id: "month", label: "In a month", days: 30 },
  { id: "quarter", label: "In 3 months", days: 91 },
  { id: "half", label: "In 6 months", days: 182 },
  { id: "year", label: "In a year", days: 365 },
];

/** The notification and the Today row go out at this hour, so a letter arrives in the morning, not at 3am. */
export const ARRIVES_AT = 9;

const atHour = (date, h) => { const [y, m, d] = date.split("-").map(Number); return new Date(y, m - 1, d, h, 0, 0, 0).getTime(); };
const clip = (s, n) => String(s || "").trim().slice(0, n);

/** A letter, or null if it has nothing in it or doesn't say when it should arrive. */
export function newLetter({ body, title = "", kind, delayDays, taskId, day, when, now = Date.now() }) {
  const text = clip(body, MAX_LETTER);
  if (!text) return null;
  const base = {
    id: `lt-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: clip(title, 60), body: text, kind, createdAt: now, updatedAt: now, openedAt: null, opens: 0,
  };
  if (kind === "later") {
    const days = Math.max(1, Math.round(Number(delayDays)));
    if (!Number.isFinite(days)) return null;
    return { ...base, openAt: atHour(addDays(dstr(new Date(now)), days), ARRIVES_AT) };
  }
  if (kind === "milestone") {
    const n = Math.round(Number(day));
    if (!taskId || !(n >= 1 && n <= 3650)) return null;
    return { ...base, taskId, day: n };
  }
  if (kind === "when") return WHEN_BY_ID[when] ? { ...base, when } : null;
  return null;
}

/** When a milestone letter becomes due: the moment the run reaches that day, moved to a civil hour. */
export function milestoneAt(task, urgeLog, day) {
  const reached = lastSlipAt(task, urgeLog) + day * DAY;
  const d = new Date(reached);
  const date = dstr(d);
  if (d.getHours() < ARRIVES_AT) return atHour(date, ARRIVES_AT);
  if (d.getHours() >= 21) return atHour(addDays(date, 1), ARRIVES_AT);
  return reached;
}

const habitOf = (state, letter) => (state.tasks || []).find((t) => t.id === letter.taskId && !t.archivedAt);

/** When a letter is due, or null if it is not tied to a time or its habit is gone. */
export function dueAt(state, letter) {
  if (letter.kind === "later") return letter.openAt;
  if (letter.kind === "milestone") {
    const task = habitOf(state, letter);
    return task ? milestoneAt(task, state.urgeLog || [], letter.day) : null;
  }
  return null;
}

/**
 * Sealed letters whose time has come. A milestone also needs the run to still be that long: a slip after the
 * moment was scheduled would otherwise let a "day 30" letter through on day 2.
 */
export function dueLetters(state, now = Date.now()) {
  return (state.letters || []).filter((l) => {
    if (l.openedAt) return false;
    const at = dueAt(state, l);
    if (at === null || at > now) return false;
    if (l.kind === "milestone") {
      const task = habitOf(state, l);
      return !!task && cleanDays(task, state.urgeLog || [], now) >= l.day;
    }
    return true;
  });
}

/** Letters kept for a named moment, newest first. They never expire: they can be read again. */
export const whenLetters = (state, when) =>
  (state.letters || []).filter((l) => l.kind === "when" && l.when === when).sort((a, b) => b.createdAt - a.createdAt);

/** The state after a letter has been read. A "when" letter stays readable; the others are marked opened. */
export function opened(state, id, at = Date.now()) {
  return {
    ...state,
    letters: (state.letters || []).map((l) =>
      (l.id === id ? { ...l, openedAt: at, opens: (l.opens || 0) + 1, updatedAt: at } : l)),
  };
}

/** What to say about a letter's wait, in words: "opens 14 Feb", "opens on day 30 of Doomscrolling". */
export function waitingFor(state, letter) {
  if (letter.openedAt && letter.kind !== "when") return "Opened";
  if (letter.kind === "when") return WHEN_BY_ID[letter.when]?.label || "For a hard moment";
  if (letter.kind === "milestone") {
    const task = habitOf(state, letter);
    return task ? `Opens on day ${letter.day} of ${task.text}` : "Its habit is gone";
  }
  return `Opens ${new Date(letter.openAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** How long ago a letter was written, as a person would say it. */
export function writtenAgo(letter, now = Date.now()) {
  const days = Math.floor((now - letter.createdAt) / DAY);
  if (days < 1) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 700) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

/** Notifications for letters that come due in the next days. A letter already due is on Today, not re-sent. */
export function letterNudges(state, { days = 7, now = Date.now() } = {}) {
  const horizon = now + days * DAY;
  const out = [];
  (state.letters || []).forEach((l) => {
    if (l.openedAt || (l.kind !== "later" && l.kind !== "milestone")) return;
    const at = dueAt(state, l);
    if (at === null || at <= now || at > horizon) return;
    out.push({
      id: `letter:${l.id}`, kind: "letter", date: dstr(new Date(at)), at: new Date(at), taskId: l.taskId || null,
      title: "A letter from you has arrived",
      body: `You wrote it ${writtenAgo(l, at)}. Open it when you have a quiet minute.`,
      actions: [{ id: "open", title: "Open" }], ref: l.id,
    });
  });
  return out;
}
