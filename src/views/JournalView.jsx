import React, { useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, PenLine, Search, X } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import {
  BLOCKERS, ENERGIZERS, FEEL_LEVELS, JOURNAL_MOODS, PILLARS, P_BY_ID, RECHARGE_LEVELS,
} from "../data/constants.js";
import { longDate, todayStr } from "../lib/date.js";
import { Card, EmptyState, IconButton, Pill, SectionLabel } from "../components/ui.jsx";

export default function JournalView({ state, onAddEntry, onRemoveEntry, onCheckin }) {
  const { checkins, journalEntries } = state;
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState("");
  const [moods, setMoods] = useState([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const sorted = useMemo(
    () => [...checkins].sort((a, b) => a.date.localeCompare(b.date)), [checkins]);

  const unified = useMemo(() => {
    const map = {};
    sorted.forEach((c) => {
      map[c.date] = map[c.date] || { date: c.date, entries: [] };
      map[c.date].checkin = c;
    });
    journalEntries.forEach((e) => {
      map[e.date] = map[e.date] || { date: e.date, entries: [] };
      map[e.date].entries.push(e);
    });
    Object.values(map).forEach((d) => d.entries.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
    let days = Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
    const q = query.trim().toLowerCase();
    if (q) {
      days = days.filter((d) =>
        (d.checkin?.note || "").toLowerCase().includes(q) ||
        (d.checkin?.deed || "").toLowerCase().includes(q) ||
        d.entries.some((e) => e.text.toLowerCase().includes(q)));
    }
    return days;
  }, [sorted, journalEntries, query]);

  const add = () => {
    if (!draft.trim()) return;
    onAddEntry({
      id: Date.now(), date: todayStr(), text: draft.trim(), moods: [...moods], createdAt: Date.now(),
    });
    setDraft("");
    setMoods([]);
  };

  const toggleMood = (id) => setMoods((m) => m.includes(id) ? m.filter((x) => x !== id) : [...m, id]);

  const entryCount = journalEntries.length + checkins.filter((c) => c.note).length;

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <p style={styles.eyebrow}>{entryCount} {entryCount === 1 ? "entry" : "entries"}</p>
          <h1 style={styles.h1}>Journal</h1>
        </div>
        <div style={{ paddingBottom: 18 }}>
          <IconButton onClick={() => setSearching((s) => !s)} active={searching} title="Search">
            <Search size={15} />
          </IconButton>
        </div>
      </div>

      {searching && (
        <div style={{ ...styles.fieldShell, marginBottom: 12 }}>
          <Search size={14} color={C.muted} />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your entries…" style={{ ...styles.bareInput, flex: 1, fontSize: 13.5 }} />
          {query && <button onClick={() => setQuery("")} style={{
            background: "none", border: "none", color: C.faint, cursor: "pointer", padding: 0,
          }}><X size={13} /></button>}
        </div>
      )}

      <Card>
        <p style={{ color: C.muted, fontSize: 10.5, margin: "0 0 8px", letterSpacing: 0.4, textTransform: "uppercase" }}>
          Today · {longDate(todayStr())}
        </p>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
          placeholder="Anything on your mind…"
          style={{ ...styles.input, resize: "none", lineHeight: 1.6, fontSize: 13.5 }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {JOURNAL_MOODS.map((m) => (
            <Pill key={m.id} on={moods.includes(m.id)} onClick={() => toggleMood(m.id)}>
              {m.emoji} {m.label}
            </Pill>
          ))}
        </div>
        <button onClick={add} style={{ ...styles.cta, height: 44, marginTop: 12, fontSize: 13.5 }}>
          <PenLine size={15} /> Save entry
        </button>
      </Card>

      {unified.length === 0 ? (
        <EmptyState
          Icon={BookOpen}
          title={query ? "No matches" : "No entries yet"}
          hint={query ? "Try a different search." : "Write above, or check in — either one lands here."}
          action={!query && (
            <button onClick={onCheckin} style={{ ...styles.ghostCta, width: "auto", padding: "0 20px" }}>
              <PenLine size={15} /> Start today's check-in
            </button>
          )}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
          {unified.map((item) => {
            const c = item.checkin;
            const vals = c ? PILLARS.map((p) => c.scores[p.id]).filter((v) => typeof v === "number") : [];
            const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            const isOpen = open === item.date;
            return (
              <Card key={item.date} style={{ marginBottom: 0 }}>
                <button onClick={() => setOpen(isOpen ? null : item.date)} style={{
                  width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <span style={{ color: C.text, fontSize: 14.5, fontWeight: 550 }}>{longDate(item.date)}</span>
                      <div style={{ display: "flex", gap: 4, marginTop: 8, alignItems: "center" }}>
                        {c ? PILLARS.map((p) => (
                          <span key={p.id} title={p.name} style={{
                            width: 9, height: 9, borderRadius: 5, background: p.color,
                            opacity: 0.25 + 0.15 * (c.scores[p.id] || 0),
                          }} />
                        )) : (
                          <span style={{ color: C.faint, fontSize: 11 }}>
                            {item.entries.length} journal entr{item.entries.length === 1 ? "y" : "ies"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {avg !== null
                        ? <span style={{ color: C.gold, fontSize: 16, fontFamily: F.display, fontWeight: 600 }}>{avg.toFixed(1)}</span>
                        : <BookOpen size={15} color={C.faint} />}
                      {isOpen ? <ChevronUp size={16} color={C.faint} /> : <ChevronDown size={16} color={C.faint} />}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                    {c && (c.feel || c.recharge) && (
                      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                        {c.feel && <span style={{ fontSize: 12, color: C.muted }}>
                          {FEEL_LEVELS.find((f) => f.v === c.feel)?.emoji} Felt {FEEL_LEVELS.find((f) => f.v === c.feel)?.label.toLowerCase()}
                        </span>}
                        {c.recharge && <span style={{ fontSize: 12, color: C.muted }}>
                          {RECHARGE_LEVELS.find((r) => r.v === c.recharge)?.emoji} {RECHARGE_LEVELS.find((r) => r.v === c.recharge)?.label}
                        </span>}
                      </div>
                    )}
                    {c && PILLARS.map((p) => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                        <p.Icon size={13} color={p.color} />
                        <span style={{ color: C.muted, fontSize: 12.5, flex: 1 }}>{p.name}</span>
                        <span style={{ color: C.text, fontSize: 12.5 }}>{c.scores[p.id] ?? "–"}</span>
                      </div>
                    ))}
                    {c && (c.energizers?.length > 0 || c.blockers?.length > 0) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                        {(c.energizers || []).map((id) => {
                          const e = ENERGIZERS.find((x) => x.id === id);
                          return e && <span key={id} style={{ ...styles.tag, color: e.color, background: alpha(e.color, 0.13) }}>
                            <e.Icon size={9} /> {e.label}
                          </span>;
                        })}
                        {(c.blockers || []).map((id) => {
                          const b = BLOCKERS.find((x) => x.id === id);
                          return b && <span key={id} style={{ ...styles.tag, color: b.color, background: alpha(b.color, 0.13) }}>
                            <b.Icon size={9} /> {b.label}
                          </span>;
                        })}
                      </div>
                    )}
                    {c?.deed && (
                      <p style={{ color: C.text, fontSize: 13, marginTop: 12, lineHeight: 1.55 }}>
                        <span style={{ color: P_BY_ID.deeds.color }}>Deed · </span>{c.deed}
                      </p>
                    )}

                    {(c?.note || item.entries.length > 0) && (
                      <div style={{
                        marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`,
                        display: "flex", flexDirection: "column", gap: 10,
                      }}>
                        <p style={{ color: C.muted, fontSize: 10.5, margin: 0, letterSpacing: 0.4, textTransform: "uppercase" }}>
                          Journal
                        </p>
                        {c?.note && (
                          <div>
                            <span style={{ color: C.faint, fontSize: 10 }}>From check-in</span>
                            <p style={{ color: C.muted, fontSize: 13, marginTop: 2, lineHeight: 1.6, fontStyle: "italic" }}>
                              “{c.note}”
                            </p>
                          </div>
                        )}
                        {item.entries.map((e) => (
                          <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ color: C.faint, fontSize: 10 }}>
                                {e.createdAt ? new Date(e.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""}
                              </span>
                              <p style={{ color: C.text, fontSize: 13, marginTop: 2, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                                {e.text}
                              </p>
                              {e.moods?.length > 0 && (
                                <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                                  {e.moods.map((mid) => {
                                    const m = JOURNAL_MOODS.find((x) => x.id === mid);
                                    return m && <span key={mid} style={styles.tag}>{m.emoji} {m.label}</span>;
                                  })}
                                </div>
                              )}
                            </div>
                            <button onClick={() => onRemoveEntry(e.id)} style={{
                              background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2, flexShrink: 0,
                            }}><X size={13} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
