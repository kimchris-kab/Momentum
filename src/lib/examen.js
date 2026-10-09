import { addDays, dstr } from "./date.js";

// The evening examen: sixty seconds, three questions, at the end of the day. The oldest character-building
// habit there is, and the cheapest — what makes it work is that it happens every night, not that it is long.

export const QUESTIONS = [
  { id: "well", label: "What did I do well today?", placeholder: "Even something small. Especially something small." },
  { id: "short", label: "Where did I fall short?", placeholder: "Say it plainly, without the excuses and without the beating up." },
  { id: "tomorrow", label: "What will I do differently tomorrow?", placeholder: "One thing. Specific enough that you'd know if you did it." },
];

export const DEFAULT_EXAMEN = { on: true, time: "21:30" };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const examenSettings = (settings) => {
  const s = settings?.examen || {};
  return { on: s.on !== false, time: HHMM.test(s.time) ? s.time : DEFAULT_EXAMEN.time };
};

export const entryId = (date) => `ex:${date}`;
export const examenFor = (state, date) => (state.examenLog || []).find((e) => e.id === entryId(date)) || null;

const clip = (s) => String(s || "").trim().slice(0, 400);

/**
 * The state after saving a night's answers, or the same state if nothing was written. Saving the same night again
 * replaces it, so an edit in the morning is one entry and not two.
 */
export function saved(state, { date, well = "", short = "", tomorrow = "", at = Date.now() }) {
  const answers = { well: clip(well), short: clip(short), tomorrow: clip(tomorrow) };
  if (!answers.well && !answers.short && !answers.tomorrow) return state;
  const entry = { id: entryId(date), date, ...answers, at, updatedAt: at };
  return { ...state, examenLog: [...(state.examenLog || []).filter((e) => e.id !== entry.id), entry] };
}

/** How many of the last `days` nights have an entry, and the run ending last night or tonight. */
export function examenStats(state, today, days = 7) {
  const have = new Set((state.examenLog || []).map((e) => e.date));
  let nights = 0;
  for (let i = 0; i < days; i++) if (have.has(addDays(today, -i))) nights += 1;
  let streak = 0;
  let cursor = have.has(today) ? today : addDays(today, -1);
  while (have.has(cursor)) { streak += 1; cursor = addDays(cursor, -1); }
  return { nights, streak, days };
}

/** What happened today that the examen could be asked about: the bad moments in the temper log, as a prompt line. */
export function todayPrompt(state, date, labels = {}) {
  const bad = (state.temperLog || []).filter((e) => e.date === date && !labels.isCalm?.(e));
  if (!bad.length) return null;
  const first = bad[0];
  const what = labels.reaction?.(first.reaction) || "Something went badly";
  return `Earlier you logged: ${what.toLowerCase()}${first.who ? ` with ${first.who}` : ""}.`;
}

/** One quiet notification each evening, withdrawn once the night's entry exists. */
export function examenNudges(state, { days = 7, now = Date.now() } = {}) {
  const cfg = examenSettings(state.settings);
  if (!cfg.on) return [];
  const out = [];
  const start = dstr(new Date(now));
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const at = new Date(`${date}T${cfg.time}:00`);
    if (at.getTime() <= now || examenFor(state, date)) continue;
    out.push({
      id: `examen:${date}`, kind: "examen", date, at,
      title: "Evening examen",
      body: "Sixty seconds: what went well, where you fell short, and what you'll do differently tomorrow.",
      actions: [{ id: "open", title: "Open" }],
    });
  }
  return out;
}
