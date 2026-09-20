import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, ChevronRight, ListTodo, Repeat, Search, Target, Wallet, X,
} from "lucide-react";
import { C, R, alpha, styles } from "../theme.js";
import { MIN_QUERY, searchEverything } from "../lib/search.js";
import { prettyDate } from "../lib/date.js";
import { EmptyState, SectionLabel } from "../components/ui.jsx";

// One field over everything. Each view already had its own search and none of them talked
// to each other, so "where did I write about that" meant remembering which of five places
// it lived in before you could look for it.
const ICONS = {
  task: ListTodo,
  habit: Repeat,
  journal: BookOpen,
  money: Wallet,
  goal: Target,
};
const COLORS = {
  task: C.gold,
  habit: C.green,
  journal: C.purple,
  money: C.teal,
  goal: C.orange,
};

export default function SearchView({ state, onBack, onOpen }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => searchEverything(state, query), [state, query]);

  return (
    <div style={styles.page}>
      <button onClick={onBack} style={styles.back}>Back</button>
      <h1 style={styles.h1}>Search</h1>

      <div style={{ ...styles.fieldShell, marginBottom: 16 }}>
        <Search size={15} color={C.muted} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tasks, habits, journal, money, goals…"
          aria-label="Search everything"
          style={{ ...styles.bareInput, flex: 1, fontSize: 14.5 }}
        />
        {query && (
          <button onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Clear"
            style={{ background: "none", border: "none", cursor: "pointer", color: C.faint }}>
            <X size={14} />
          </button>
        )}
      </div>

      {!query.trim() && (
        <EmptyState
          Icon={Search}
          title="Look for anything"
          hint="A task, a habit, something you wrote months ago, what you spent at a place — it all lives in one index."
        />
      )}

      {results.tooShort && (
        <p style={{ color: C.faint, fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
          Keep going — {MIN_QUERY} letters is enough to start. One would match most of the app,
          which isn't an answer.
        </p>
      )}

      {!results.tooShort && query.trim() && results.total === 0 && (
        <EmptyState
          Icon={Search}
          title={`Nothing matches “${query.trim()}”`}
          hint="Search looks at names, notes, journal text, payees and categories. Try a word you'd have written at the time."
        />
      )}

      {results.total > 0 && (
        <>
          <p style={{ color: C.faint, fontSize: 11, margin: "0 0 4px" }}>
            {results.total} {results.total === 1 ? "match" : "matches"}
          </p>
          {results.groups.map((g) => (
            <div key={g.id}>
              <SectionLabel color={COLORS[g.id]}>{g.label}</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {g.items.map((item) => (
                  <ResultRow key={`${g.id}-${item.id}`} item={item} onOpen={onOpen} />
                ))}
              </div>
              {g.more > 0 && (
                <p style={{ color: C.faint, fontSize: 11, margin: "8px 0 0" }}>
                  and {g.more} more — narrow it down a little
                </p>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function ResultRow({ item, onOpen }) {
  const Icon = ICONS[item.kind] || Search;
  const color = COLORS[item.kind] || C.muted;
  return (
    <button onClick={() => onOpen(item)} style={{
      display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left",
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md,
      padding: "11px 13px", cursor: "pointer",
    }}>
      <span style={{
        width: 28, height: 28, borderRadius: 9, flexShrink: 0, display: "flex",
        alignItems: "center", justifyContent: "center",
        background: alpha(color, 0.13), border: `1px solid ${alpha(color, 0.22)}`,
      }}>
        <Icon size={13} color={color} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: "block", color: C.text, fontSize: 13.5, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.title}
        </span>
        {item.subtitle && (
          <span style={{
            display: "block", color: C.faint, fontSize: 11, marginTop: 3, lineHeight: 1.45,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {item.subtitle}
          </span>
        )}
      </span>
      {item.date && (
        <span style={{ color: C.faint, fontSize: 10.5, flexShrink: 0 }}>{prettyDate(item.date)}</span>
      )}
      <ChevronRight size={14} color={C.faint} style={{ flexShrink: 0 }} />
    </button>
  );
}
