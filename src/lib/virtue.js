import { addDays, dstr, daysBetween } from "./date.js";
import { seeded } from "./seeded.js";

// Character, one trait at a time. You pick a virtue to work on; each day it gives one small, concrete thing to
// practise, and at the end of the day one question — did I live it? — answered in a tap. Over a few weeks that
// is a record of character moving, which is otherwise the hardest thing to see in yourself.
//
// Everything is plain data, so the notifications, the card on Today and the screen all agree.

export const VIRTUES = [
  {
    id: "patience", name: "Patience", emoji: "⏳",
    line: "Staying steady when things are slow, or slow people.",
    why: "Most of what we regret saying was said in the first ten seconds of being irritated. Patience is mostly the ability to wait out those ten seconds.",
    practices: [
      "Let the next person finish their sentence completely before you reply.",
      "Take one slow breath before answering any message today.",
      "Choose the slowest queue on purpose and stay calm in it.",
      "When something is taking too long, name what you're feeling instead of acting on it.",
      "Give one person today twice the time you normally would.",
      "Don't check your phone while you wait for anything today.",
      "When you feel the urge to interrupt, count to three first.",
      "Ask a follow-up question before you give your opinion.",
      "Do one thing today without hurrying it, start to finish.",
      "When someone repeats themselves, listen as if it's the first time.",
    ],
  },
  {
    id: "honesty", name: "Honesty", emoji: "🪞",
    line: "Saying what's true, kindly, including to yourself.",
    why: "Small lies are a habit that makes bigger ones easy. Truth told early and gently costs far less than truth that is found out.",
    practices: [
      "Don't exaggerate anything today, not even a little.",
      "When you don't know something, say so plainly instead of guessing.",
      "Say one true thing you'd normally keep quiet, kindly.",
      "If you're running late, say so honestly instead of inventing a reason.",
      "Admit one mistake out loud today, without excuses.",
      "Don't say \"I'm fine\" if you're not. Say something true instead.",
      "Give honest feedback to someone, with a kind reason behind it.",
      "Keep every small promise you make today, or say plainly why you can't.",
      "Notice one thing you tell yourself that isn't quite true.",
      "Pay a compliment only when you mean it.",
    ],
  },
  {
    id: "humility", name: "Humility", emoji: "🌱",
    line: "Learning from anyone, and not needing to be right.",
    why: "Being right feels good for a minute. Being teachable pays off for decades.",
    practices: [
      "Let someone else have the last word in one conversation.",
      "Ask someone for help, or for their view, on something you could do alone.",
      "Say \"you're right\" the next time you are wrong.",
      "Give credit out loud to someone for something today.",
      "Listen to a view you disagree with until you can state it fairly.",
      "Do a job today nobody will notice or thank you for.",
      "Don't mention an achievement of yours today.",
      "Ask a question you'd normally be too proud to ask.",
      "Thank someone who has helped you, and say specifically how.",
      "When you feel the need to prove something, let it go once.",
    ],
  },
  {
    id: "courage", name: "Courage", emoji: "🦁",
    line: "Doing the right thing while afraid of it.",
    why: "Courage isn't the absence of fear; it's a small step taken with fear along for the ride. The steps are what build it.",
    practices: [
      "Do the thing you've been avoiding for the shortest possible time: two minutes.",
      "Say no to one thing you'd normally agree to out of fear of letting people down.",
      "Start the difficult conversation, or write the first line of it.",
      "Speak up once in a room where you'd usually stay quiet.",
      "Do one thing today that you're slightly afraid of doing badly.",
      "Ask for what you actually want, once.",
      "Make the phone call instead of sending the message.",
      "Admit what you're afraid of, to yourself or to someone you trust.",
      "Defend someone who isn't in the room.",
      "Take the first step on something you keep postponing.",
    ],
  },
  {
    id: "selfcontrol", name: "Self-control", emoji: "🧭",
    line: "Choosing what you want most over what you want right now.",
    why: "Self-control isn't force, it's setting things up so the right choice is the easy one, and pausing long enough to choose.",
    practices: [
      "Pause for ten seconds before every impulse purchase or snack today.",
      "Put your phone in another room for one hour.",
      "Do the hardest task first, before anything easy.",
      "Wait twenty minutes before giving in to one craving, and see what happens.",
      "Stop one thing a little earlier than you normally would.",
      "Say your plan for the day out loud, then follow it.",
      "Close one tab, app or habit loop you know pulls you off course.",
      "Eat slowly at one meal, with nothing else going on.",
      "Don't reply when you're angry. Write it, wait, then decide.",
      "Leave one thing unfinished that you'd normally push through, because it's time to stop.",
    ],
  },
  {
    id: "kindness", name: "Kindness", emoji: "🤝",
    line: "Making things easier for people, without being asked.",
    why: "Kindness is a skill of noticing. The people around you are carrying more than they say.",
    practices: [
      "Send a message to someone you haven't spoken to for a while, just to check in.",
      "Do one small favour without being asked, and don't mention it.",
      "Hold the door, give up the seat, let someone ahead.",
      "Give someone your full attention for five minutes, phone away.",
      "Say something genuinely appreciative to someone, today.",
      "Assume the best about someone who annoys you, and act on it once.",
      "Share something useful you know with someone who needs it.",
      "Be gentle with yourself about one mistake today, the way you would with a friend.",
      "Thank someone whose work usually goes unthanked.",
      "Leave a place cleaner than you found it.",
    ],
  },
  {
    id: "gratitude", name: "Gratitude", emoji: "☀️",
    line: "Noticing what's already good, and saying so.",
    why: "The mind is built to notice what's missing. Gratitude is a deliberate counterweight, and it gets stronger with use.",
    practices: [
      "Name three specific good things from today before you sleep.",
      "Thank one person today and say what exactly you're thankful for.",
      "Notice one ordinary thing that works perfectly, and appreciate it.",
      "Write down one thing someone did for you this week.",
      "Eat one meal today appreciating where it came from.",
      "Think of something you once wished for that you now have.",
      "Say thank you before you say anything else in one conversation.",
      "Notice something good about your body that you usually ignore.",
      "Thank someone in your family for something you take for granted.",
      "When you complain today, follow it with one thing that's still good.",
    ],
  },
  {
    id: "presence", name: "Presence", emoji: "🌿",
    line: "Being where you are, with who you're with.",
    why: "Attention is the most real thing you can give anyone, and the thing most easily lost to a screen.",
    practices: [
      "Have one meal with no screen at all.",
      "When someone talks to you, look at them and put everything else down.",
      "Spend ten minutes outside with no headphones.",
      "Do one task at a time today. Finish it before starting another.",
      "Leave your phone face-down for a whole conversation.",
      "Notice five things you can see, hear and feel, once.",
      "Walk somewhere slowly and pay attention to the whole route.",
      "Ask someone how they are, and listen to the entire answer.",
      "Put your phone away for the first and last half hour of the day.",
      "Listen for the feeling behind what someone says, not just the words.",
    ],
  },
];

export const VIRTUE_BY_ID = Object.fromEntries(VIRTUES.map((v) => [v.id, v]));

// ---- Settings ----

export const DEFAULT_VIRTUE = { on: true, notify: true, morning: "08:00", evening: "20:30" };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const mins = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** The person's settings with anything missing or silly put right. The check-in has to come at least three hours after the practice. */
export function virtueSettings(settings) {
  const s = settings?.virtue || {};
  let morning = HHMM.test(s.morning) ? s.morning : DEFAULT_VIRTUE.morning;
  let evening = HHMM.test(s.evening) ? s.evening : DEFAULT_VIRTUE.evening;
  if (mins(evening) - mins(morning) < 180) { morning = DEFAULT_VIRTUE.morning; evening = DEFAULT_VIRTUE.evening; }
  return { on: s.on !== false, notify: s.notify !== false, morning, evening };
}

// ---- Which virtue, and today's practice ----

export const SCORES = { lived: 2, partly: 1, missed: 0 };
export const SCORE_WORDS = { 2: "Lived it", 1: "Partly", 0: "Missed it" };
/** How long a virtue is worked on before the app suggests moving on. A suggestion only: nothing changes by itself. */
export const SUGGEST_AFTER_DAYS = 7;

/** The state's chosen virtue and the day it was chosen, or null. */
export function activeVirtue(state) {
  const a = state.virtue;
  const v = a && VIRTUE_BY_ID[a.id];
  return v ? { ...v, since: a.since } : null;
}

export const chooseVirtue = (id, date) => (VIRTUE_BY_ID[id] ? { id, since: date } : null);

/** Which day of working on it this is, counting the first as day 1. */
export const dayNumber = (active, date) => Math.max(1, daysBetween(active.since, date) + 1);

/**
 * The day's practice. The order of a virtue's practices is shuffled once for the run it was chosen in and then taken
 * in turn, so nothing repeats until they've all been used, and asking again on the same day gives the same answer.
 */
export function practiceFor(active, date) {
  const rand = seeded(`virtue:${active.id}:${active.since}`);
  const order = active.practices.map((p, i) => [rand(), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const n = dayNumber(active, date) - 1;
  return active.practices[order[n % order.length]];
}

// ---- The evening question ----

export const entryId = (virtue, date) => `vl:${virtue}:${date}`;

/** The answer to "did I live it?" for a day, as a record. Answering again the same day replaces it. */
export const newVirtueEntry = ({ virtue, date, score, at = Date.now() }) => ({
  id: entryId(virtue, date), virtue, date, score, at,
});

export const entryFor = (state, virtue, date) => (state.virtueLog || []).find((e) => e.id === entryId(virtue, date)) || null;

/** The state after answering for a date; the same state if the answer is meaningless. */
export function answered(state, { date, score, at = Date.now() }) {
  const active = state.virtue && VIRTUE_BY_ID[state.virtue.id];
  if (!active || ![0, 1, 2].includes(score)) return state;
  const entry = newVirtueEntry({ virtue: state.virtue.id, date, score, at });
  return { ...state, virtueLog: [...(state.virtueLog || []).filter((e) => e.id !== entry.id), entry] };
}

/** Reads the answer carried by a notification button. */
export const scoreFromAction = (action) => (action === "lived" ? 2 : action === "partly" ? 1 : action === "missed" ? 0 : null);

export function stats(state, virtue, today) {
  const rows = (state.virtueLog || []).filter((e) => e.virtue === virtue).sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(rows.map((e) => [e.date, e]));
  // The run of days in a row answered "lived it" or "partly", ending today or yesterday (today isn't over yet).
  let streak = 0;
  let cursor = byDate.has(today) ? today : addDays(today, -1);
  while (byDate.get(cursor)?.score >= 1) { streak += 1; cursor = addDays(cursor, -1); }
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    week.push({ date, score: byDate.has(date) ? byDate.get(date).score : null });
  }
  const answeredWeek = week.filter((d) => d.score !== null);
  const average = answeredWeek.length ? answeredWeek.reduce((a, d) => a + d.score, 0) / answeredWeek.length / 2 : null;
  return {
    days: rows.length, lived: rows.filter((e) => e.score === 2).length, streak, week,
    // 0..1 over the last seven days that were answered, or null with no answers: how fully it was lived.
    average,
  };
}

/** Time to suggest another virtue: a week in, unless the person has said to keep going within the last week. */
export function suggestMove(state, today) {
  const a = activeVirtue(state);
  if (!a || dayNumber(a, today) <= SUGGEST_AFTER_DAYS) return null;
  const kept = state.virtue?.kept;
  if (kept && daysBetween(kept, today) < SUGGEST_AFTER_DAYS) return null;
  const s = stats(state, a.id, today);
  return { from: a, answered: s.week.filter((d) => d.score !== null).length, average: s.average };
}

/** "Keep going with this one": the same virtue, asked about again in a week rather than now. */
export const keepVirtue = (state, today) => (state.virtue ? { ...state, virtue: { ...state.virtue, kept: today } } : state);

// ---- Notifications ----

const at = (date, hhmm) => new Date(`${date}T${hhmm}:00`);

export const VIRTUE_ACTIONS = {
  lived: { id: "lived", title: "Lived it" },
  partly: { id: "partly", title: "Partly" },
  missed: { id: "missed", title: "Missed it" },
  open: { id: "open", title: "Open" },
};

/**
 * The next days' notifications: the morning practice, and the evening question unless that day is already answered.
 * Nothing for a moment already past, and nothing when notifications for this are off.
 */
export function virtueNudges(state, { days = 7, now = Date.now() } = {}) {
  const cfg = virtueSettings(state.settings);
  const active = activeVirtue(state);
  if (!cfg.on || !cfg.notify || !active) return [];
  const out = [];
  const start = dstr(new Date(now));
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const dn = dayNumber(active, date);
    const morning = at(date, cfg.morning);
    if (morning.getTime() > now) {
      out.push({
        id: `virtue:${date}:practice`, kind: "virtue", date, at: morning,
        title: `${active.name} · day ${dn}`,
        body: practiceFor(active, date),
        actions: [VIRTUE_ACTIONS.open],
      });
    }
    const evening = at(date, cfg.evening);
    if (evening.getTime() > now && !entryFor(state, active.id, date)) {
      out.push({
        id: `virtue:${date}:check`, kind: "virtue-check", date, at: evening,
        title: `Did you live ${active.name.toLowerCase()} today?`,
        body: practiceFor(active, date),
        actions: [VIRTUE_ACTIONS.lived, VIRTUE_ACTIONS.partly, VIRTUE_ACTIONS.missed],
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Adds the virtue notifications to the ordinary ones, in time order. */
export function mergeVirtueNudges(state, items, days = 7, now = Date.now()) {
  return [...items, ...virtueNudges(state, { days, now })].sort((a, b) => a.at - b.at);
}
