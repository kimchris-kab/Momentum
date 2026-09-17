import { PILLARS, WEEKDAYS, WK_ORDER } from "../data/constants.js";
import { addDays, pad, parseD, todayStr } from "./date.js";
import { dailyRule, monthlyRule, weeklyCountRule, weeklyRule } from "./tasks.js";

// One-line capture: "gym tomorrow 7am 3x a week !high #health".
//
// The whole design rests on one rule — nothing here is applied silently. Every match comes
// back as a token with the exact span it claimed, the caller renders those as removable
// chips, and dismissing one re-parses with that span ignored. A parser that quietly eats
// "Friday" out of "Friday standup notes" is worse than no parser; a parser that shows you
// it did and lets you take it back is strictly better than typing into a sheet.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, once: 1, twice: 2 };
const DAY_NAMES = WEEKDAYS.reduce((m, d) => {
  m[d.key] = d.key;
  m[d.label.toLowerCase()] = d.key;
  m[d.short.toLowerCase()] = d.key;
  return m;
}, {});
const DAY_RE = Object.keys(DAY_NAMES).sort((a, b) => b.length - a.length).join("|");
const MONTH_RE = MONTHS.join("|");

const PRIORITY_WORDS = { 1: "high", 2: "med", 3: "low", high: "high", med: "med", medium: "med", low: "low" };

// The next date with this weekday, counting today as a match.
function nextWeekday(key, from) {
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (WK_ORDER[parseD(d).getDay()] === key) return d;
  }
  return from;
}

function makeDate(month, day, from) {
  const year = parseD(from).getFullYear();
  const candidate = `${year}-${pad(month)}-${pad(day)}`;
  // A bare "3 mar" typed in December means next March, not one that has already gone.
  if (candidate < from) return `${year + 1}-${pad(month)}-${pad(day)}`;
  return candidate;
}

// Bare hours are ambiguous. 1–6 reads as afternoon, 7–12 as morning — and either way the
// chip spells out what was assumed, so a wrong guess is visible before it is saved.
function normalizeTime(hour, minute, meridiem) {
  let h = hour;
  if (meridiem === "pm" && h < 12) h += 12;
  else if (meridiem === "am" && h === 12) h = 0;
  else if (!meridiem && h >= 1 && h <= 6) h += 12;
  return `${pad(h % 24)}:${pad(minute || 0)}`;
}

const fmtTime = (t) => {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${period}`;
};

// Each matcher yields { kind, start, end, apply, label }. Order is priority: the first
// matcher to claim a span wins it, so "every friday" is a recurrence before "friday" can
// be read as a due date.
function collect(input, { today, lists, pillars }) {
  const s = input.toLowerCase();
  const found = [];
  const push = (m, kind, label, apply) => {
    found.push({ kind, label, apply, start: m.index, end: m.index + m[0].length, raw: m[0] });
  };
  const scan = (re, fn) => {
    const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let m;
    while ((m = r.exec(s)) !== null) {
      fn(m);
      if (m[0] === "") r.lastIndex++;
    }
  };

  // --- Recurrence (before dates, so "every friday" isn't eaten as a due date) ---
  scan(new RegExp(`\\b(?:(\\d+|${Object.keys(NUM_WORDS).join("|")})\\s*(?:x|times?)\\s*(?:a|per|\\/)\\s*week|(once|twice)\\s+a\\s+week)\\b`, "i"), (m) => {
    const word = m[1] || m[2];
    const n = Number(word) || NUM_WORDS[word] || 3;
    const rule = weeklyCountRule(n);
    push(m, "repeat", n === 1 ? "Once a week" : n === 2 ? "Twice a week" : `${n}× a week`,
      (o) => { o.recurrence = rule; o.dueDate = null; });
  });

  scan(/\bevery\s+other\s+day\b|\bevery\s+(\d+)\s+days?\b/i, (m) => {
    const n = m[1] ? Number(m[1]) : 2;
    push(m, "repeat", n === 2 ? "Every other day" : `Every ${n} days`,
      (o) => { o.recurrence = dailyRule(n); o.dueDate = null; });
  });

  scan(/\b(?:every\s*day|everyday|daily)\b/i, (m) => {
    push(m, "repeat", "Every day", (o) => { o.recurrence = dailyRule(1); o.dueDate = null; });
  });

  scan(/\bon\s+weekdays\b|\bevery\s+weekday\b/i, (m) => {
    push(m, "repeat", "Weekdays",
      (o) => { o.recurrence = weeklyRule(["mon", "tue", "wed", "thu", "fri"]); o.dueDate = null; });
  });
  scan(/\bon\s+weekends\b|\bevery\s+weekend\b/i, (m) => {
    push(m, "repeat", "Weekends",
      (o) => { o.recurrence = weeklyRule(["sat", "sun"]); o.dueDate = null; });
  });

  // "every mon, wed and fri"
  scan(new RegExp(`\\bevery\\s+((?:${DAY_RE})(?:\\s*(?:,|and|&|\\/|\\s)\\s*(?:${DAY_RE}))*)\\b`, "i"), (m) => {
    const keys = [...new Set((m[1].match(new RegExp(DAY_RE, "gi")) || []).map((d) => DAY_NAMES[d.toLowerCase()]))];
    if (!keys.length) return;
    const ordered = WK_ORDER.filter((k) => keys.includes(k));
    push(m, "repeat", ordered.map((k) => k[0].toUpperCase() + k.slice(1)).join(", "),
      (o) => { o.recurrence = weeklyRule(ordered); o.dueDate = null; });
  });

  scan(/\bevery\s+month\b|\bmonthly(?:\s+on\s+the\s+(\d{1,2}))?\b/i, (m) => {
    const day = m[1] ? Number(m[1]) : parseD(today).getDate();
    push(m, "repeat", `Monthly on day ${day}`,
      (o) => { o.recurrence = monthlyRule(day); o.dueDate = null; });
  });
  scan(/\bevery\s+week\b|\bweekly\b/i, (m) => {
    const key = WK_ORDER[parseD(today).getDay()];
    push(m, "repeat", "Weekly", (o) => { o.recurrence = weeklyRule([key]); o.dueDate = null; });
  });

  // --- Dates ---
  scan(/\btoday\b|\btonight\b/i, (m) => push(m, "date", "Today", (o) => { o.dueDate = today; }));
  scan(/\btomorrow\b|\btmr\b/i, (m) => push(m, "date", "Tomorrow", (o) => { o.dueDate = addDays(today, 1); }));
  scan(/\bnext\s+week\b/i, (m) => push(m, "date", "Next week", (o) => { o.dueDate = addDays(today, 7); }));
  scan(/\bin\s+(\d+)\s+(day|week|month)s?\b/i, (m) => {
    const n = Number(m[1]);
    const mult = m[2].toLowerCase() === "week" ? 7 : m[2].toLowerCase() === "month" ? 30 : 1;
    const date = addDays(today, n * mult);
    push(m, "date", `In ${n} ${m[2]}${n > 1 ? "s" : ""}`, (o) => { o.dueDate = date; });
  });
  scan(/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => {
    push(m, "date", m[0], (o) => { o.dueDate = m[0]; });
  });
  scan(new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_RE})[a-z]*\\b|\\b(${MONTH_RE})[a-z]*\\s+(\\d{1,2})\\b`, "i"), (m) => {
    const day = Number(m[1] || m[4]);
    const mon = MONTHS.indexOf((m[2] || m[3]).toLowerCase()) + 1;
    if (!day || day > 31 || !mon) return;
    const date = makeDate(mon, day, today);
    push(m, "date", `${day} ${(m[2] || m[3]).replace(/^./, (c) => c.toUpperCase())}`, (o) => { o.dueDate = date; });
  });
  scan(new RegExp(`\\b(next\\s+)?(${DAY_RE})\\b`, "i"), (m) => {
    const key = DAY_NAMES[m[2].toLowerCase()];
    // Bare "friday" is the next one, counting today. "next friday" is the one after that.
    const date = m[1] ? addDays(nextWeekday(key, today), 7) : nextWeekday(key, today);
    const wd = WEEKDAYS.find((d) => d.key === key);
    push(m, "date", `${m[1] ? "Next " : ""}${wd.label}`, (o) => { o.dueDate = date; });
  });

  // --- Time ---
  scan(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b|\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(\d{1,2}):(\d{2})\b/i, (m) => {
    const hour = Number(m[1] ?? m[4] ?? m[7]);
    const minute = Number(m[2] ?? m[5] ?? m[8] ?? 0);
    const meridiem = (m[3] || m[6] || "").toLowerCase() || null;
    if (hour > 23 || minute > 59) return;
    if (m[7] !== undefined && hour > 23) return;
    const time = normalizeTime(hour, minute, meridiem);
    push(m, "time", fmtTime(time), (o) => { o.time = time; });
  });
  scan(/\bnoon\b/i, (m) => push(m, "time", "12:00 PM", (o) => { o.time = "12:00"; }));
  scan(/\bmidnight\b/i, (m) => push(m, "time", "12:00 AM", (o) => { o.time = "00:00"; }));

  // --- Priority / list / pillar ---
  // "!high" / "!1" / a standalone "p1". The word forms need the bang: a bare "p"+"low"
  // would otherwise quietly eat the word "plow".
  const pushPriority = (m, word) => {
    const level = PRIORITY_WORDS[word.toLowerCase()];
    push(m, "priority", `${level === "med" ? "Medium" : level[0].toUpperCase() + level.slice(1)} priority`,
      (o) => { o.priority = level; });
  };
  scan(/![ ]?(1|2|3|high|medium|med|low)\b/i, (m) => pushPriority(m, m[1]));
  scan(/\bp([123])\b/i, (m) => pushPriority(m, m[1]));

  scan(/#([\w-]+)/i, (m) => {
    const wanted = m[1].toLowerCase().replace(/[-_]/g, " ");
    const list = lists.find((l) => l.name.toLowerCase() === wanted)
      || lists.find((l) => l.name.toLowerCase().startsWith(wanted));
    if (!list) return;
    push(m, "list", list.name, (o) => { o.listId = list.id; });
  });

  scan(/@([\w-]+)/i, (m) => {
    const wanted = m[1].toLowerCase();
    const pillar = pillars.find((p) => p.id === wanted)
      || pillars.find((p) => p.name.toLowerCase().replace(/[^a-z]/g, "").startsWith(wanted.replace(/[^a-z]/g, "")));
    if (!pillar) return;
    push(m, "pillar", pillar.name, (o) => { o.pillarId = pillar.id; });
  });

  return found;
}

/**
 * @param input  the raw one-line string
 * @param opts   { lists, pillars, today, ignore }  — `ignore` is a Set of token ids the
 *               person has dismissed, which is how a chip's X takes a word back.
 * @returns { text, patch, tokens, hasMatch }
 */
export function parseTaskInput(input, opts = {}) {
  const today = opts.today || todayStr();
  const lists = opts.lists || [];
  const pillars = opts.pillars || PILLARS;
  const ignore = opts.ignore || new Set();

  const all = collect(input, { today, lists, pillars })
    .map((t) => ({ ...t, id: `${t.kind}:${t.start}:${t.raw}` }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  // One span, one meaning. Later overlapping matches lose.
  const taken = [];
  const tokens = [];
  all.forEach((t) => {
    if (ignore.has(t.id)) return;
    if (taken.some((r) => t.start < r.end && t.end > r.start)) return;
    // Only one of each kind survives — two due dates in one line is a typo, not an intent.
    if (tokens.some((k) => k.kind === t.kind)) return;
    taken.push(t);
    tokens.push(t);
  });

  const patch = {};
  tokens.forEach((t) => t.apply(patch));

  // Strip claimed spans out of the title.
  let text = input;
  [...taken].sort((a, b) => b.start - a.start).forEach((t) => {
    text = text.slice(0, t.start) + text.slice(t.end);
  });
  text = text.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();

  return { text, patch, tokens, hasMatch: tokens.length > 0, ignored: [...ignore] };
}

// What the parser understands, for the hint shown under an empty capture field.
export const PARSE_EXAMPLES = [
  "Pay rent on the 1st monthly",
  "Gym 3x a week @health",
  "Call mum friday at 6pm",
  "Read every day !high",
];
