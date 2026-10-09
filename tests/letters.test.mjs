import { suite } from "./harness.mjs";
import {
  ARRIVES_AT, DELAYS, MAX_LETTER, WHEN, dueAt, dueLetters, letterNudges, milestoneAt, newLetter, opened, waitingFor,
  whenLetters, writtenAgo,
} from "../src/lib/letters.js";
import { emptyState } from "../src/lib/migrate.js";
import { mergeStates } from "../src/lib/merge.js";

const t = suite("letters");
const DAY = 86400000;
const NOW = new Date("2026-10-08T14:00:00").getTime();
const at = (days, hour = 12) => { const d = new Date(NOW + days * DAY); d.setHours(hour, 0, 0, 0); return d.getTime(); };
const daily = { freq: "daily", interval: 1, weekdays: [], monthDay: null };
const quit = { id: "q1", kind: "break", text: "Doomscrolling", recurrence: daily, startDate: "2026-09-01", createdAt: new Date("2026-09-01T08:00:00").getTime(), order: 1 };
const lapse = (daysAgo) => ({ id: `l${daysAgo}`, taskId: "q1", kind: "lapse", at: NOW - daysAgo * DAY, date: "x" });
const base = (over = {}) => ({ ...emptyState(), tasks: [quit], urgeLog: [lapse(5)], ...over });

// ---- writing ----
const later = newLetter({ body: "  Hello, future me.  ", kind: "later", delayDays: 30, now: NOW });
t.eq("a letter keeps its words, trimmed", later.body, "Hello, future me.");
t.eq("a delayed letter arrives at nine in the morning", new Date(later.openAt).getHours(), ARRIVES_AT);
t.eq("on the day that many days on", new Date(later.openAt).getDate(), new Date(NOW + 30 * DAY).getDate());
t.ok("sealed to begin with", later.openedAt === null && later.opens === 0);
t.eq("an empty letter is nothing", newLetter({ body: "   ", kind: "later", delayDays: 7, now: NOW }), null);
t.eq("so is one with no way of arriving", newLetter({ body: "x", kind: "someday", now: NOW }), null);
t.eq("a long letter is cut at the limit", newLetter({ body: "x".repeat(MAX_LETTER + 500), kind: "later", delayDays: 7, now: NOW }).body.length, MAX_LETTER);
t.eq("a delay is at least a day", new Date(newLetter({ body: "x", kind: "later", delayDays: 0, now: NOW }).openAt).getDate(), new Date(NOW + DAY).getDate());
t.eq("a milestone letter needs its habit and a day", newLetter({ body: "x", kind: "milestone", now: NOW }), null);
t.eq("with them it is kept", newLetter({ body: "x", kind: "milestone", taskId: "q1", day: 30, now: NOW }).day, 30);
t.eq("an open-when letter must name its moment", newLetter({ body: "x", kind: "when", when: "nonsense", now: NOW }), null);
t.eq("and keeps it", newLetter({ body: "x", kind: "when", when: "urge", now: NOW }).when, "urge");
t.ok("ids differ", newLetter({ body: "a", kind: "when", when: "low", now: NOW }).id !== newLetter({ body: "a", kind: "when", when: "low", now: NOW }).id);
t.ok("the delays offered are all real", DELAYS.every((d) => d.days >= 7) && WHEN.length === 3);

// ---- when it is due ----
const sealed = { ...later, openAt: at(-1, 9) };
t.eq("a delayed letter is due once its time has passed", dueLetters(base({ letters: [sealed] }), NOW).length, 1);
t.eq("not before", dueLetters(base({ letters: [{ ...later, openAt: at(3, 9) }] }), NOW).length, 0);
t.eq("not once opened", dueLetters(base({ letters: [{ ...sealed, openedAt: NOW }] }), NOW).length, 0);
const day5 = { id: "m1", kind: "milestone", taskId: "q1", day: 5, createdAt: NOW - 9 * DAY, openedAt: null };
const day30 = { ...day5, id: "m2", day: 30 };
t.eq("a milestone letter is due once the run is that long", dueLetters(base({ letters: [day5] }), NOW).map((l) => l.id), ["m1"]);
t.eq("and not before", dueLetters(base({ letters: [day30] }), NOW), []);
t.eq("a slip after it was due takes it back", dueLetters(base({ letters: [day5], urgeLog: [lapse(1)] }), NOW), []);
t.eq("a milestone for a deleted habit is never due", dueLetters(base({ letters: [day5], tasks: [] }), NOW), []);
t.eq("open-when letters are never 'due'", dueLetters(base({ letters: [{ id: "w", kind: "when", when: "urge", createdAt: 1, openedAt: null }] }), NOW), []);
t.eq("the due time of a milestone is on its day", new Date(dueAt(base({ letters: [day30] }), day30)).getTime() > NOW, true);
const reached = milestoneAt(quit, [lapse(5)], 30);
t.ok("never in the small hours", new Date(reached).getHours() >= ARRIVES_AT && new Date(reached).getHours() < 21);

// ---- reading ----
const s1 = opened(base({ letters: [sealed] }), sealed.id, NOW);
t.eq("opening marks it and counts the reading", [s1.letters[0].openedAt, s1.letters[0].opens], [NOW, 1]);
t.eq("reading again counts again", opened(s1, sealed.id, NOW + 5).letters[0].opens, 2);
t.eq("an unknown id changes nothing", opened(base({ letters: [sealed] }), "nope", NOW).letters[0].openedAt, null);
const w1 = { id: "w1", kind: "when", when: "urge", body: "a", createdAt: 1, openedAt: null };
const w2 = { id: "w2", kind: "when", when: "urge", body: "b", createdAt: 5, openedAt: null };
const w3 = { id: "w3", kind: "when", when: "low", body: "c", createdAt: 9, openedAt: null };
t.eq("open-when letters for a moment, newest first", whenLetters(base({ letters: [w1, w2, w3] }), "urge").map((l) => l.id), ["w2", "w1"]);
t.eq("and none for a moment with nothing", whenLetters(base({ letters: [w1] }), "temper"), []);

// ---- the words around them ----
t.eq("a delayed letter says when", /^Opens \d+ \w+ \d{4}$/.test(waitingFor(base(), later)) || /^Opens/.test(waitingFor(base(), later)), true);
t.eq("a milestone says which day and habit", waitingFor(base(), day30), "Opens on day 30 of Doomscrolling");
t.eq("a letter for a gone habit says so", waitingFor(base({ tasks: [] }), day30), "Its habit is gone");
t.eq("an open-when says its moment", waitingFor(base(), w1), "When I want to give in");
t.eq("an opened one says opened", waitingFor(base(), { ...sealed, openedAt: 5 }), "Opened");
t.eq("written ago, in people's words", [0.2, 1, 5, 30, 400].map((d) => writtenAgo({ createdAt: NOW - d * DAY }, NOW)), ["earlier today", "yesterday", "5 days ago", "4 weeks ago", "13 months ago"]);

// ---- notifications ----
const items = letterNudges(base({ letters: [{ ...later, openAt: at(2, 9) }, { ...later, id: "far", openAt: at(40, 9) }, w1] }), { now: NOW });
t.eq("a letter arriving this week is scheduled; the rest are not", items.map((i) => i.id), [`letter:${later.id}`]);
t.eq("at the time it arrives", items[0].at.getTime(), at(2, 9));
t.eq("carrying which letter it is", items[0].ref, later.id);
t.eq("with a button", items[0].actions.map((a) => a.id), ["open"]);
t.ok("the notification doesn't give the letter away", !items[0].body.includes("future me"));
t.eq("an opened letter is not announced", letterNudges(base({ letters: [{ ...later, openAt: at(2, 9), openedAt: 1 }] }), { now: NOW }), []);
t.eq("one already due is not re-sent", letterNudges(base({ letters: [sealed] }), { now: NOW }), []);

// ---- kept and merged ----
const a = base({ letters: [later] });
const b = base({ letters: [{ ...later, id: "other" }] });
t.eq("two devices' letters are both kept", mergeStates(a, b).letters.length, 2);
const readLater = opened(a, later.id, NOW + 1000);
t.eq("a letter read on one device is read on both", mergeStates(a, readLater).letters[0].openedAt, NOW + 1000);
