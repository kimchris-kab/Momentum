import React, { Suspense, lazy, useMemo, useState } from "react";
import { Check, Compass, Flame, Heart, Pause, Plus, Trash2 } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { addDays, parseD, todayStr } from "../lib/date.js";
import {
  SCORE_WORDS, VIRTUES, activeVirtue, dayNumber, entryFor, practiceFor, stats, suggestMove,
} from "../lib/virtue.js";
import {
  REACTIONS, TRIGGERS, daysSinceLastReaction, insights, isCalm, newestFirst, newTemperEntry, patterns, reactionLabel,
  triggerLabel,
} from "../lib/temper.js";
import { Card, EmptyState, PageHeader, Pill, SectionLabel, SegmentedControl, Sheet } from "../components/ui.jsx";

const BreathPacer = lazy(() => import("../components/BreathPacer.jsx"));
const TONE = C.orange;
const SCORE_COLOR = { 2: C.green, 1: C.gold, 0: C.red };
const LETTER = ["S", "M", "T", "W", "T", "F", "S"];

export default function CharacterView({
  state, onBack, initialTab = "virtue", onChoose, onClear, onKeep, onAnswer, onAddTemper, onRemoveTemper, surf, onSurf,
}) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div style={styles.page}>
      <PageHeader eyebrow="Character" title="Who you're becoming" onBack={onBack} />
      <SegmentedControl value={tab} onChange={setTab} style={{ marginBottom: 16 }}
        options={[{ id: "virtue", label: "Virtue of the week" }, { id: "temper", label: "Temper log" }]} />
      {tab === "virtue"
        ? <VirtueTab state={state} onChoose={onChoose} onClear={onClear} onKeep={onKeep} onAnswer={onAnswer} />
        : <TemperTab state={state} onAdd={onAddTemper} onRemove={onRemoveTemper} surf={surf} onSurf={onSurf} />}
    </div>
  );
}

// ---- Virtue ------------------------------------------------------------------------------------

function VirtueTab({ state, onChoose, onClear, onKeep, onAnswer }) {
  const today = todayStr();
  const active = useMemo(() => activeVirtue(state), [state.virtue]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picking, setPicking] = useState(!active);
  const [open, setOpen] = useState(null);

  if (!active || picking) {
    const chosen = VIRTUES.find((v) => v.id === open);
    return (
      <>
        <p style={styles.lede}>
          {active ? "Choose another trait. Your answers for the current one are kept." : "Pick one trait to work on. Each day you get one small thing to practise, and one question at the end of it."}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {VIRTUES.map((v) => (
            <button key={v.id} onClick={() => setOpen(v.id)} aria-pressed={open === v.id} style={{
              textAlign: "left", cursor: "pointer", padding: 13, borderRadius: R.lg, fontFamily: F.body,
              background: open === v.id ? alpha(TONE, 0.12) : C.surface,
              border: `1px solid ${open === v.id ? alpha(TONE, 0.5) : C.border}`, color: C.text,
            }}>
              <span style={{ fontSize: 20 }}>{v.emoji}</span>
              <p style={{ margin: "6px 0 2px", fontWeight: 650, fontSize: 14 }}>{v.name}</p>
              <p style={{ margin: 0, color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>{v.line}</p>
            </button>
          ))}
        </div>
        {chosen && (
          <Card style={{ marginTop: 14, borderColor: alpha(TONE, 0.3) }}>
            <p style={{ color: C.text, fontSize: 14, fontWeight: 650, margin: 0 }}>{chosen.emoji} {chosen.name}</p>
            <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.65, margin: "6px 0 12px" }}>{chosen.why}</p>
            <button onClick={() => { onChoose(chosen.id); setPicking(false); setOpen(null); }}
              style={{ ...styles.cta, height: 44, fontSize: 13.5 }}>
              <Compass size={15} /> Work on {chosen.name.toLowerCase()}
            </button>
          </Card>
        )}
        {active && (
          <button onClick={() => setPicking(false)} style={{ ...styles.linkBtn, margin: "14px auto 0", color: C.faint }}>Keep {active.name.toLowerCase()}</button>
        )}
      </>
    );
  }

  const entry = entryFor(state, active.id, today);
  const st = stats(state, active.id, today);
  const move = suggestMove(state, today);
  return (
    <>
      <Card style={{ borderColor: alpha(TONE, 0.32) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontSize: 24 }}>{active.emoji}</span>
          <div style={{ flex: 1 }}>
            <p style={{ color: C.text, fontSize: 17, fontWeight: 650, margin: 0, fontFamily: F.display }}>{active.name}</p>
            <p style={{ color: C.muted, fontSize: 11.5, margin: "2px 0 0" }}>Day {dayNumber(active, today)} · {active.line}</p>
          </div>
        </div>
        <p style={{ color: C.faint, fontSize: 10.5, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase", margin: "16px 0 5px" }}>Today's practice</p>
        <p style={{ color: C.text, fontSize: 16, fontWeight: 600, lineHeight: 1.45, margin: 0, fontFamily: F.display }}>{practiceFor(active, today)}</p>

        <p style={{ color: C.muted, fontSize: 12, margin: "16px 0 7px" }}>Did you live {active.name.toLowerCase()} today?</p>
        <div style={{ display: "flex", gap: 7 }}>
          {[[2, "Lived it"], [1, "Partly"], [0, "Missed it"]].map(([score, label]) => {
            const on = entry?.score === score;
            return (
              <button key={score} onClick={() => onAnswer({ date: today, score })} aria-pressed={on} style={{
                ...styles.ghostCta, height: 40, flex: 1, fontSize: 12.5,
                ...(on ? { borderColor: SCORE_COLOR[score], background: alpha(SCORE_COLOR[score], 0.14), color: SCORE_COLOR[score] } : {}),
              }}>
                {on && <Check size={13} />} {label}
              </button>
            );
          })}
        </div>
      </Card>

      <SectionLabel>This week</SectionLabel>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {st.week.map((d) => (
            <div key={d.date} style={{ textAlign: "center", width: 36 }}>
              <div title={d.score === null ? "Not answered" : SCORE_WORDS[d.score]} style={{
                width: 28, height: 28, borderRadius: 14, margin: "0 auto",
                background: d.score === null ? "transparent" : alpha(SCORE_COLOR[d.score], 0.25),
                border: `1.6px solid ${d.score === null ? C.border : SCORE_COLOR[d.score]}`,
              }} />
              <span style={{ color: d.date === today ? C.text : C.faint, fontSize: 10.5, fontWeight: d.date === today ? 700 : 500 }}>
                {LETTER[parseD(d.date).getDay()]}
              </span>
            </div>
          ))}
        </div>
        <p style={{ color: C.muted, fontSize: 12.5, margin: "12px 0 0", display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Flame size={13} color={C.gold} /> {st.streak} in a row</span>
          <span>{st.lived} fully lived of {st.days} answered</span>
        </p>
      </Card>

      {move && (
        <Card style={{ borderColor: alpha(C.gold, 0.35) }}>
          <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>A week in</p>
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: "5px 0 10px" }}>
            {move.answered ? `You answered ${move.answered} of the last 7 days. ` : ""}Keep going until it's second nature, or move to another trait. Both are fine.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onKeep} style={{ ...styles.ghostCta, height: 38, flex: 1, fontSize: 12.5 }}>Keep going</button>
            <button onClick={() => setPicking(true)} style={{ ...styles.cta, height: 38, flex: 1, fontSize: 12.5 }}>Choose another</button>
          </div>
        </Card>
      )}

      <SectionLabel>Why it matters</SectionLabel>
      <Card><p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.7, margin: 0 }}>{active.why}</p></Card>
      <button onClick={() => setPicking(true)} style={{ ...styles.linkBtn, margin: "6px auto 0", color: C.faint }}>Change trait</button>
      <button onClick={onClear} style={{ ...styles.linkBtn, margin: "4px auto 0", color: C.faint }}>Stop for now</button>
    </>
  );
}

// ---- Temper ------------------------------------------------------------------------------------

const when = (e) => {
  const d = parseD(e.date);
  const day = e.date === todayStr() ? "Today" : e.date === addDays(todayStr(), -1) ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${day}, ${new Date(e.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
};

function TemperTab({ state, onAdd, onRemove, surf, onSurf }) {
  const log = state.temperLog || [];
  const [logging, setLogging] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [paused, setPaused] = useState(false);
  const clear = daysSinceLastReaction(log);
  const p = useMemo(() => patterns(log), [log]);
  const lines = useMemo(() => insights(log), [log]);
  const recent = useMemo(() => newestFirst(log).slice(0, 8), [log]);

  return (
    <>
      <Card style={{ borderColor: alpha(TONE, 0.32) }}>
        <p style={{ color: C.faint, fontSize: 10.5, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase", margin: 0 }}>Since you last lost it</p>
        <p style={{ color: C.text, fontSize: 28, fontWeight: 650, margin: "4px 0 2px", fontFamily: F.display }}>
          {clear === null ? (log.length ? "No bad moments logged" : "Nothing logged yet") : clear === 0 ? "Today" : `${clear} day${clear === 1 ? "" : "s"}`}
        </p>
        <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: "0 0 13px" }}>
          Log the moments it gets the better of you and the ones where it doesn't. Five seconds each. After a few, it shows what sets you off.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPausing(true)} style={{ ...styles.cta, height: 44, flex: 1, fontSize: 13.5 }}>
            <Pause size={15} /> Pause first
          </button>
          <button onClick={() => { setPaused(false); setLogging(true); }} style={{ ...styles.ghostCta, height: 44, flex: 1, fontSize: 13.5 }}>
            <Plus size={15} /> Log a moment
          </button>
        </div>
      </Card>

      {pausing && (
        <Card style={{ borderColor: alpha(C.teal, 0.35) }}>
          <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: "0 0 4px" }}>Breathe before you answer</p>
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: "0 0 10px" }}>A minute is enough. The feeling will have changed by the end of it.</p>
          <Suspense fallback={null}>{surf && onSurf && <BreathPacer surf={surf} onSurf={onSurf} />}</Suspense>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setPausing(false); setPaused(true); setLogging(true); }} style={{ ...styles.cta, height: 40, flex: 1, fontSize: 13 }}>I'm calmer. Log it</button>
            <button onClick={() => setPausing(false)} style={{ ...styles.ghostCta, height: 40, width: 90, fontSize: 12.5 }}>Close</button>
          </div>
        </Card>
      )}

      <SectionLabel>What it shows</SectionLabel>
      <Card>
        {lines.length === 0 ? (
          <p style={{ color: C.faint, fontSize: 12.5, margin: 0 }}>Nothing yet. Log a moment and the patterns appear here.</p>
        ) : lines.map((l) => (
          <p key={l} style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: "0 0 7px" }}>{l}</p>
        ))}
        {p.total > 0 && (
          <p style={{ color: C.faint, fontSize: 11.5, margin: "6px 0 0" }}>
            {p.calm} calm and {p.bad} not, of {p.total} logged.
          </p>
        )}
      </Card>

      <SectionLabel>Recent</SectionLabel>
      {recent.length === 0 ? (
        <EmptyState Icon={Heart} title="Nothing logged" hint="The first entry is the hardest. It's just a tap or two." />
      ) : recent.map((e) => (
        <Card key={e.id} style={{ padding: 13 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <i style={{ width: 9, height: 9, borderRadius: 5, marginTop: 5, flexShrink: 0, background: isCalm(e) ? C.green : C.orange }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>{reactionLabel(e.reaction)}</p>
              <p style={{ color: C.muted, fontSize: 11.5, margin: "2px 0 0" }}>
                {when(e)} · {triggerLabel(e.trigger)}{e.who ? ` · ${e.who}` : ""}{e.paused ? " · paused first" : ""}
              </p>
              {e.note && <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, margin: "6px 0 0", fontStyle: "italic" }}>Next time: {e.note}</p>}
            </div>
            <button onClick={() => onRemove(e.id)} aria-label="Delete this entry" title="Delete" style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", padding: 4 }}>
              <Trash2 size={14} />
            </button>
          </div>
        </Card>
      ))}

      <LogSheet open={logging} paused={paused} onClose={() => setLogging(false)}
        onSave={(entry) => { onAdd(entry); setLogging(false); setPaused(false); }} />
    </>
  );
}

function LogSheet({ open, paused, onClose, onSave }) {
  const [trigger, setTrigger] = useState(null);
  const [reaction, setReaction] = useState(null);
  const [who, setWho] = useState("");
  const [note, setNote] = useState("");
  const done = () => { setTrigger(null); setReaction(null); setWho(""); setNote(""); };
  const save = () => {
    const entry = newTemperEntry({ trigger: trigger || "other", reaction, who, note, paused });
    if (!entry) return;
    onSave(entry);
    done();
  };
  const small = { color: C.muted, fontSize: 11.5, fontWeight: 600, margin: "14px 0 7px" };
  return (
    <Sheet open={open} onClose={() => { onClose(); }} title="Log a moment">
      <p style={{ ...small, marginTop: 0 }}>What set it off?</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {TRIGGERS.map((t) => <Pill key={t.id} on={trigger === t.id} color={TONE} onClick={() => setTrigger(t.id)}>{t.label}</Pill>)}
      </div>
      <p style={small}>What happened?</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {REACTIONS.map((r) => <Pill key={r.id} on={reaction === r.id} color={r.calm ? C.green : TONE} onClick={() => setReaction(r.id)}>{r.label}</Pill>)}
      </div>
      <p style={small}>Who was it with? (optional)</p>
      <input value={who} onChange={(e) => setWho(e.target.value)} maxLength={40} aria-label="Who it was with" placeholder="e.g. a coworker, my sister" style={styles.input} />
      <p style={small}>What would you do next time? (optional)</p>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={2} aria-label="What you would do next time"
        placeholder="e.g. walk away for two minutes first" style={{ ...styles.input, resize: "vertical", fontFamily: F.body }} />
      {paused && <p style={{ color: C.teal, fontSize: 11.5, margin: "10px 0 0" }}>Noted that you paused first.</p>}
      <button onClick={save} disabled={!reaction} style={{ ...styles.cta, height: 46, fontSize: 14, marginTop: 16, opacity: reaction ? 1 : 0.5 }}>
        Save
      </button>
    </Sheet>
  );
}
