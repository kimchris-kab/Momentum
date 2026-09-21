import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen, ChevronDown, ChevronUp, Download, Flame, History, PenLine, Search, Shuffle,
  Sparkles, Star, X,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { BLOCKERS, ENERGIZERS, FEEL_LEVELS, JOURNAL_MOODS, JOURNAL_PROMPTS, PILLARS, P_BY_ID, RECHARGE_LEVELS, pillarOf } from "../data/constants.js";
import { hashIdx, longDate, prettyDate, todayStr } from "../lib/date.js";
import {
  downloadText, entryText, filterEntries, groupByMonth, journalStats, onThisDay, toMarkdown,
  wordCount,
} from "../lib/journal.js";
import {
  Card, EmptyState, IconButton, Pill, SegmentedControl, SectionLabel,
} from "../components/ui.jsx";

const MODES = [
  { id: "free", label: "Free write" },
  { id: "prompt", label: "Prompt" },
  { id: "gratitude", label: "Gratitude" },
];
const emptyGratitude = ["", "", ""];

export default function JournalView({
  state, onAddEntry, onUpdateEntry, onRemoveEntry, onOpenEntry, onCheckin, onSaveDraft,
}) {
  const { checkins, journalEntries, journalDraft } = state;

  const [mode, setMode] = useState(journalDraft?.mode || "free");
  const [draft, setDraft] = useState(journalDraft?.text || "");
  const [items, setItems] = useState(journalDraft?.items || emptyGratitude);
  const [moods, setMoods] = useState(journalDraft?.moods || []);
  const [pillarId, setPillarId] = useState(journalDraft?.pillarId || null);
  const [date, setDate] = useState(todayStr());
  const [prompt, setPrompt] = useState(
    journalDraft?.prompt || JOURNAL_PROMPTS[hashIdx(todayStr(), JOURNAL_PROMPTS.length)]);

  const [open, setOpen] = useState(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [moodFilter, setMoodFilter] = useState(null);
  const [pillarFilter, setPillarFilter] = useState(null);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [openMonths, setOpenMonths] = useState({});

  // Keep an unfinished entry across navigation — losing a long write to a stray tab tap is
  // the fastest way to stop someone journalling at all. Debounced so it isn't a write per key.
  useEffect(() => {
    const t = setTimeout(() => {
      onSaveDraft({ mode, text: draft, items, moods, pillarId, prompt });
    }, 700);
    return () => clearTimeout(t);
  }, [mode, draft, items, moods, pillarId, prompt]);

  const stats = useMemo(() => journalStats(journalEntries, checkins), [journalEntries, checkins]);
  const flashbacks = useMemo(() => onThisDay(journalEntries), [journalEntries]);

  const filtered = useMemo(
    () => filterEntries(journalEntries, { query, mood: moodFilter, pillarId: pillarFilter, favouritesOnly }),
    [journalEntries, query, moodFilter, pillarFilter, favouritesOnly]);

  const filtering = !!(query.trim() || moodFilter || pillarFilter || favouritesOnly);

  const months = useMemo(() => {
    const map = {};
    // check-ins only join the timeline when nothing is being filtered — a text search is
    // about finding something you wrote, not every day you happened to log
    if (!filtering) {
      checkins.forEach((c) => {
        map[c.date] = map[c.date] || { date: c.date, entries: [] };
        map[c.date].checkin = c;
      });
    }
    filtered.forEach((e) => {
      map[e.date] = map[e.date] || { date: e.date, entries: [] };
      map[e.date].entries.push(e);
    });
    Object.values(map).forEach((d) => d.entries.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
    const days = Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
    return groupByMonth(days);
  }, [filtered, checkins, filtering]);

  const canSave = mode === "gratitude" ? items.some((i) => i.trim()) : draft.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    onAddEntry({
      id: Date.now(),
      date,
      kind: mode,
      text: mode === "gratitude" ? "" : draft.trim(),
      items: mode === "gratitude" ? items.map((i) => i.trim()).filter(Boolean) : [],
      prompt: mode === "prompt" ? prompt : null,
      moods: [...moods],
      pillarId,
      favorite: false,
      createdAt: Date.now(),
    });
    setDraft("");
    setItems(emptyGratitude);
    setMoods([]);
    setPillarId(null);
    setDate(todayStr());
    onSaveDraft(null);
  };

  const toggleMood = (id) => setMoods((m) => m.includes(id) ? m.filter((x) => x !== id) : [...m, id]);
  const words = wordCount(mode === "gratitude" ? items.join(" ") : draft);

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <p style={styles.eyebrow}>
            {stats.total} {stats.total === 1 ? "entry" : "entries"}
            {stats.streak > 0 && ` · ${stats.streak}-day streak`}
          </p>
          <h1 style={styles.h1}>Journal</h1>
        </div>
        <div style={{ display: "flex", gap: 6, paddingBottom: 18 }}>
          <IconButton onClick={() => setSearching((s) => !s)} active={searching} title="Search">
            <Search size={15} />
          </IconButton>
          <IconButton title="Export" onClick={() => downloadText(
            `momentum-journal-${todayStr()}.md`, toMarkdown(journalEntries, checkins))}>
            <Download size={15} />
          </IconButton>
        </div>
      </div>

      {/* ---- Stats ---- */}
      <Card flip style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <Stat value={stats.streak} label="Day streak" Icon={Flame} />
          <Stat value={stats.thisMonth} label="This month" />
          <Stat value={stats.words >= 1000 ? `${(stats.words / 1000).toFixed(1)}k` : stats.words} label="Words" />
          <Stat value={stats.favourites} label="Starred" />
        </div>
        {stats.total > 0 && (
          <button onClick={() => setShowStats((v) => !v)} style={{ ...styles.linkBtn, marginTop: 12 }}>
            {showStats ? <ChevronUp size={13} /> : <ChevronDown size={13} />} More
          </button>
        )}
        {showStats && (
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.65, margin: "10px 0 0" }}>
            You've written on <b style={{ color: C.text }}>{stats.daysWritten}</b>{" "}
            {stats.daysWritten === 1 ? "day" : "days"}, averaging{" "}
            <b style={{ color: C.text }}>{stats.avgWords}</b> words an entry.
            {stats.longest && <> Your longest was {wordCount(entryText(stats.longest))} words on{" "}
              {prettyDate(stats.longest.date)}.</>}
          </p>
        )}
      </Card>

      {/* ---- Composer ---- */}
      <Card>
        <SegmentedControl value={mode} onChange={setMode} options={MODES} />

        {mode === "prompt" && (
          <div style={{
            marginTop: 12, background: C.goldSoft, border: `1px solid ${alpha(C.gold, 0.22)}`,
            borderRadius: R.md, padding: "12px 13px",
          }}>
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <Sparkles size={14} color={C.gold} style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{
                flex: 1, color: C.text, fontSize: 13, lineHeight: 1.55, margin: 0,
                fontFamily: F.display, fontStyle: "italic",
              }}>{prompt}</p>
            </div>
            <button onClick={() => setPrompt(
              JOURNAL_PROMPTS[Math.floor(Math.random() * JOURNAL_PROMPTS.length)])}
              style={{ ...styles.linkBtn, color: C.gold, marginTop: 10 }}>
              <Shuffle size={12} /> Another prompt
            </button>
          </div>
        )}

        {mode === "gratitude" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <p style={{ color: C.muted, fontSize: 11.5, margin: 0 }}>Three things worth noticing today.</p>
            {[0, 1, 2].map((i) => (
              <input key={i} value={items[i] || ""}
                onChange={(e) => setItems((cur) => {
                  const next = [...cur];
                  next[i] = e.target.value;
                  return next;
                })}
                placeholder={["Something small", "Someone", "Something about you"][i]}
                style={{ ...styles.input, fontSize: 13.5 }} />
            ))}
          </div>
        ) : (
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5}
            placeholder={mode === "prompt" ? "Answer it honestly…" : "Anything on your mind…"}
            style={{ ...styles.input, marginTop: 12, resize: "none", lineHeight: 1.65, fontSize: 14 }} />
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <span style={{ color: C.faint, fontSize: 10.5 }}>
            {words} word{words === 1 ? "" : "s"}
            {date !== todayStr() && ` · ${prettyDate(date)}`}
          </span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayStr())}
            style={{ ...styles.bareInput, fontSize: 11.5, color: C.muted, width: 118 }} />
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {JOURNAL_MOODS.map((m) => (
            <Pill key={m.id} on={moods.includes(m.id)} onClick={() => toggleMood(m.id)}>
              {m.emoji} {m.label}
            </Pill>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {PILLARS.map((p) => (
            <Pill key={p.id} on={pillarId === p.id} color={p.color}
              onClick={() => setPillarId(pillarId === p.id ? null : p.id)}>
              <p.Icon size={11} style={{ verticalAlign: -2, marginRight: 4 }} />{p.name}
            </Pill>
          ))}
        </div>

        <button onClick={save} disabled={!canSave} style={{
          ...styles.cta, height: 46, marginTop: 14, fontSize: 14,
          opacity: canSave ? 1 : 0.45, cursor: canSave ? "pointer" : "default",
        }}>
          <PenLine size={15} /> Save entry
        </button>
      </Card>

      {/* ---- On this day ---- */}
      {flashbacks.length > 0 && !filtering && (
        <>
          <SectionLabel>On this day</SectionLabel>
          {flashbacks.map((f) => (
            <button key={f.label} onClick={() => onOpenEntry(f.entry)} style={{
              width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 8,
              background: `linear-gradient(135deg, ${alpha(C.purple, 0.09)}, ${C.surface})`,
              border: `1px solid ${alpha(C.purple, 0.25)}`, borderRadius: R.lg, padding: "13px 15px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <History size={13} color={C.purple} />
                <span style={{ color: C.purple, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600 }}>
                  {f.label}
                </span>
                <span style={{ color: C.faint, fontSize: 10.5, marginLeft: "auto" }}>{prettyDate(f.entry.date)}</span>
              </div>
              <p style={{
                color: C.text, fontSize: 13, lineHeight: 1.6, margin: "8px 0 0",
                display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}>
                {entryText(f.entry)}
              </p>
            </button>
          ))}
        </>
      )}

      {/* ---- Search + filters ---- */}
      {searching && (
        <Card>
          <div style={styles.fieldShell}>
            <Search size={14} color={C.muted} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search everything you've written…"
              style={{ ...styles.bareInput, flex: 1, fontSize: 13.5 }} />
            {query && <button onClick={() => setQuery("")} style={{
              background: "none", border: "none", color: C.faint, cursor: "pointer", padding: 0,
            }}><X size={13} /></button>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            <Pill on={favouritesOnly} onClick={() => setFavouritesOnly((v) => !v)}>
              <Star size={10} style={{ verticalAlign: -1, marginRight: 4 }} />Starred
            </Pill>
            {JOURNAL_MOODS.map((m) => (
              <Pill key={m.id} on={moodFilter === m.id}
                onClick={() => setMoodFilter(moodFilter === m.id ? null : m.id)}>
                {m.emoji}
              </Pill>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {PILLARS.map((p) => (
              <Pill key={p.id} on={pillarFilter === p.id} color={p.color}
                onClick={() => setPillarFilter(pillarFilter === p.id ? null : p.id)}>
                {p.name}
              </Pill>
            ))}
          </div>
          {filtering && (
            <p style={{ color: C.muted, fontSize: 11.5, margin: "12px 0 0" }}>
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"} match
            </p>
          )}
        </Card>
      )}

      {/* ---- Timeline ---- */}
      {months.length === 0 ? (
        <EmptyState
          Icon={BookOpen}
          title={filtering ? "No matches" : "No entries yet"}
          hint={filtering
            ? "Try a different search or clear the filters."
            : "Write above — or use a prompt when the blank box wins. Check-in reflections land here too."}
          action={!filtering && (
            <button onClick={onCheckin} style={{ ...styles.ghostCta, width: "auto", padding: "0 20px" }}>
              <PenLine size={15} /> Start today's check-in
            </button>
          )}
        />
      ) : (
        months.map((month, mi) => {
          const collapsed = openMonths[month.mKey] === false || (mi > 0 && openMonths[month.mKey] === undefined);
          return (
            <div key={month.mKey}>
              <button onClick={() => setOpenMonths((o) => ({ ...o, [month.mKey]: collapsed }))} style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none",
                border: "none", cursor: "pointer", padding: 0, margin: "24px 0 10px",
              }}>
                {collapsed ? <ChevronDown size={14} color={C.faint} /> : <ChevronUp size={14} color={C.faint} />}
                <span style={{
                  color: C.muted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600,
                }}>{month.label}</span>
                <span style={{ ...styles.tag, marginLeft: "auto" }}>{month.entryCount}</span>
              </button>
              {!collapsed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {month.items.map((item) => (
                    <DayCard key={item.date} item={item} open={open === item.date}
                      onToggle={() => setOpen(open === item.date ? null : item.date)}
                      onOpenEntry={onOpenEntry}
                      onToggleFavorite={(e) => onUpdateEntry(e.id, { favorite: !e.favorite })} />
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function Stat({ value, label, Icon }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        {Icon && value > 0 && <Icon size={13} color={C.gold} />}
        <span style={{ color: C.text, fontSize: 19, fontFamily: F.display, fontWeight: 600 }}>{value}</span>
      </div>
      <p style={{ color: C.muted, fontSize: 9.5, margin: "3px 0 0", letterSpacing: 0.3, textTransform: "uppercase" }}>
        {label}
      </p>
    </div>
  );
}

function DayCard({ item, open, onToggle, onOpenEntry, onToggleFavorite }) {
  const c = item.checkin;
  // Same guard as everywhere else that reads a check-in: an older save may have no scores
  // object, and an unguarded read here blanks the whole Journal tab.
  const vals = c ? PILLARS.map((p) => c.scores?.[p.id]).filter((v) => typeof v === "number") : [];
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;

  return (
    <Card style={{ marginBottom: 0 }}>
      <button onClick={onToggle} style={{
        width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ color: C.text, fontSize: 14.5, fontWeight: 550 }}>{longDate(item.date)}</span>
            <div style={{ display: "flex", gap: 4, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              {c && PILLARS.map((p) => (
                <span key={p.id} title={p.name} style={{
                  width: 9, height: 9, borderRadius: 5, background: p.color,
                  opacity: 0.25 + 0.15 * (c.scores?.[p.id] || 0),
                }} />
              ))}
              {item.entries.length > 0 && (
                <span style={{ ...styles.tag, marginLeft: c ? 6 : 0 }}>
                  {item.entries.length} entr{item.entries.length === 1 ? "y" : "ies"}
                </span>
              )}
              {item.entries.some((e) => e.favorite) && <Star size={11} color={C.gold} fill={C.gold} />}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {avg !== null
              ? <span style={{ color: C.gold, fontSize: 16, fontFamily: F.display, fontWeight: 600 }}>{avg.toFixed(1)}</span>
              : <BookOpen size={15} color={C.faint} />}
            {open ? <ChevronUp size={16} color={C.faint} /> : <ChevronDown size={16} color={C.faint} />}
          </div>
        </div>
      </button>

      {!open && item.entries[0] && (
        <p style={{
          color: C.muted, fontSize: 12.5, lineHeight: 1.6, margin: "10px 0 0",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {entryText(item.entries[0])}
        </p>
      )}

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          {c && (c.feel || c.recharge) && (
            <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
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
              <span style={{ color: C.text, fontSize: 12.5 }}>{c.scores?.[p.id] ?? "–"}</span>
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
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              {c?.note && (
                <div>
                  <span style={{ color: C.faint, fontSize: 10 }}>From check-in</span>
                  <p style={{ color: C.muted, fontSize: 13, marginTop: 2, lineHeight: 1.6, fontStyle: "italic" }}>
                    “{c.note}”
                  </p>
                </div>
              )}
              {item.entries.map((e) => {
                const pillar = pillarOf(e.pillarId);
                return (
                  <div key={e.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: C.faint, fontSize: 10 }}>
                        {e.createdAt ? new Date(e.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""}
                      </span>
                      {e.kind === "gratitude" && <span style={styles.tag}>Gratitude</span>}
                      <button onClick={() => onToggleFavorite(e)} style={{
                        background: "none", border: "none", cursor: "pointer", padding: 2, marginLeft: "auto",
                      }}>
                        <Star size={13} color={e.favorite ? C.gold : C.faint} fill={e.favorite ? C.gold : "none"} />
                      </button>
                      <button onClick={() => onOpenEntry(e)} style={{ ...styles.linkBtn, fontSize: 11 }}>
                        Edit
                      </button>
                    </div>
                    {e.prompt && (
                      <p style={{ color: C.gold, fontSize: 11.5, margin: "6px 0 0", fontStyle: "italic", lineHeight: 1.5 }}>
                        {e.prompt}
                      </p>
                    )}
                    {e.kind === "gratitude" ? (
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        {(e.items || []).map((i, idx) => (
                          <li key={idx} style={{ color: C.text, fontSize: 13, lineHeight: 1.65 }}>{i}</li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ color: C.text, fontSize: 13, marginTop: 6, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                        {e.text}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap" }}>
                      {pillar && (
                        <span style={{ ...styles.tag, color: pillar.color, background: alpha(pillar.color, 0.13) }}>
                          <pillar.Icon size={9} /> {pillar.name}
                        </span>
                      )}
                      {(e.moods || []).map((mid) => {
                        const m = JOURNAL_MOODS.find((x) => x.id === mid);
                        return m && <span key={mid} style={styles.tag}>{m.emoji} {m.label}</span>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
