import { TX_CAT_BY_ID } from "../data/constants.js";
import { describeRecurrence } from "./tasks.js";
import { entryText } from "./journal.js";
import { money } from "./date.js";

// Everything this app knows, findable from one field.
//
// Six months in there is no way to answer "where did I write about that", "what did I spend
// at the garage", or "what happened to that task" without remembering which of five views
// it lived in. Each view has its own search; none of them talk to each other.
//
// Ranking is deliberately simple and explainable: a match on the thing's own name beats a
// match buried in its body, an exact name beats a prefix, and ties break by recency. No
// fuzzy matching — a phone keyboard plus fuzzy scoring produces confident nonsense.

export const MIN_QUERY = 2;
const PER_KIND = 6;

export const KINDS = [
  { id: "task", label: "Tasks" },
  { id: "habit", label: "Habits" },
  { id: "journal", label: "Journal" },
  { id: "money", label: "Money" },
  { id: "goal", label: "Goals" },
];

const norm = (s) => String(s || "").toLowerCase().trim();

/**
 * How well `text` answers `q`, as a score out of 100. Returns 0 for no match, so a caller
 * can filter on truthiness.
 */
export function scoreText(text, q, weight = 1) {
  const t = norm(text);
  if (!t || !q) return 0;
  if (t === q) return 100 * weight;
  if (t.startsWith(q)) return 80 * weight;
  // A match at a word boundary reads as intentional; one inside a word usually doesn't.
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t)) return 60 * weight;
  if (t.includes(q)) return 30 * weight;
  return 0;
}

const best = (...scores) => Math.max(0, ...scores);

function taskResults(state, q) {
  return (state.tasks || [])
    .filter((t) => !t.archivedAt)
    .map((t) => {
      const score = best(
        scoreText(t.text, q),
        scoreText(t.notes, q, 0.4),
        ...(t.subtasks || []).map((s) => scoreText(s.text, q, 0.5)),
      );
      if (!score) return null;
      const habit = t.kind !== "todo" && !!t.recurrence;
      return {
        kind: habit ? "habit" : "task",
        id: t.id,
        title: t.text,
        // The date already has its own column, so repeating it here would just crowd the row.
        subtitle: habit
          ? [describeRecurrence(t.recurrence), t.kind === "break" ? "Breaking" : null].filter(Boolean).join(" · ")
          : [t.done ? "Done" : null, excerptIfUseful(t.notes, q, t.text)].filter(Boolean).join(" · "),
        date: t.dueDate || null,
        sort: t.dueDate || "",
        score,
        task: t,
      };
    })
    .filter(Boolean);
}

function journalResults(state, q) {
  return (state.journalEntries || [])
    .map((e) => {
      const body = entryText(e);
      const score = best(scoreText(e.prompt, q, 0.8), scoreText(body, q, 0.6));
      if (!score) return null;
      const flat = body.replace(/\s+/g, " ").trim();
      const title = e.prompt || (flat.length > 48 ? `${flat.slice(0, 47)}…` : flat) || "Entry";
      return {
        kind: "journal",
        id: e.id,
        title,
        // An entry with no prompt is titled by its own opening words, so an excerpt of the
        // same opening words underneath says nothing twice.
        subtitle: excerptIfUseful(flat, q, title),
        date: e.date,
        sort: e.date,
        score,
        entry: e,
      };
    })
    .filter(Boolean);
}

function moneyResults(state, q) {
  return (state.transactions || [])
    .map((tx) => {
      const cat = TX_CAT_BY_ID[tx.catId];
      const score = best(scoreText(tx.payee, q), scoreText(tx.note, q, 0.7), scoreText(cat?.label, q, 0.5));
      if (!score) return null;
      return {
        kind: "money",
        id: tx.id,
        title: tx.payee || tx.note || cat?.label || "Entry",
        subtitle: [
          `${tx.type === "income" ? "+" : "−"}${money(tx.amount)}`,
          cat?.label,
          tx.payee && tx.note ? tx.note : null,
        ].filter(Boolean).join(" · "),
        date: tx.date,
        sort: tx.date,
        score,
        tx,
      };
    })
    .filter(Boolean);
}

function goalResults(state, q) {
  const fromGoals = (state.goals || []).map((g) => {
    const score = best(
      scoreText(g.text, q),
      scoreText(g.why, q, 0.5),
      ...(g.subtasks || []).map((s) => scoreText(s.text, q, 0.5)),
    );
    return score ? {
      kind: "goal", id: g.id, title: g.text, subtitle: g.done ? "Done" : "Goal",
      date: g.targetDate || null, sort: g.targetDate || "", score, goal: g,
    } : null;
  });
  const fromMoney = (state.strategies || []).map((s) => {
    const score = best(scoreText(s.name, q), scoreText(s.notes, q, 0.4));
    return score ? {
      kind: "goal", id: s.id, title: s.name,
      subtitle: `Money goal · ${money(s.current || 0)} of ${money(s.target || 0)}`,
      date: s.targetDate || null, sort: s.targetDate || "", score, strategy: s,
    } : null;
  });
  return [...fromGoals, ...fromMoney].filter(Boolean);
}

/**
 * The excerpt, unless it would only repeat the title back. Two lines saying the same thing
 * is worse than one, especially at 390px.
 */
export function excerptIfUseful(text, q, title) {
  const ex = excerpt(text, q);
  if (!ex) return null;
  const head = (s) => norm(s).replace(/^…/, "").slice(0, 24);
  return head(ex) === head(title) ? null : ex;
}

/** A window of the body around the match, so a result shows why it matched. */
export function excerpt(text, q, span = 70) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const at = norm(flat).indexOf(q);
  if (at < 0) return flat.length > span ? `${flat.slice(0, span - 1)}…` : flat;
  const start = Math.max(0, at - Math.floor(span / 3));
  const end = Math.min(flat.length, start + span);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end).trim()}${end < flat.length ? "…" : ""}`;
}

/**
 * @returns { query, total, groups: [{ id, label, items, more }] }
 * Groups keep their declared order rather than competing on score: a list that reorders
 * itself as you type is a list you can't aim at.
 */
export function searchEverything(state, query, { perKind = PER_KIND } = {}) {
  const q = norm(query);
  if (q.length < MIN_QUERY) return { query: q, total: 0, groups: [], tooShort: query.trim().length > 0 };

  const all = [
    ...taskResults(state, q),
    ...journalResults(state, q),
    ...moneyResults(state, q),
    ...goalResults(state, q),
  ];

  const groups = KINDS.map(({ id, label }) => {
    const items = all
      .filter((r) => r.kind === id)
      .sort((a, b) => b.score - a.score || String(b.sort).localeCompare(String(a.sort)));
    return { id, label, items: items.slice(0, perKind), more: Math.max(0, items.length - perKind) };
  }).filter((g) => g.items.length);

  return { query: q, total: all.length, groups, tooShort: false };
}
