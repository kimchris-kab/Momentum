import React, { useMemo, useState } from "react";
import { Check, Dices, FlaskConical, Plus, Repeat, Sprout, Trash2 } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { P_BY_ID, PILLARS } from "../data/constants.js";
import { addDays, prettyDate, todayStr } from "../lib/date.js";
import {
  KIND_BY_ID, METRIC_KINDS, STARTERS, adherence, analyze, asOf, dayNumber, describeMetric, describeResult,
  endDateOf, metricProblem, newExperiment, phaseOf, stoppedDate, todayAssignment,
} from "../lib/experiments.js";
import { Card, EmptyState, Pill, SectionLabel, SegmentedControl, Sheet } from "../components/ui.jsx";

const TONE = {
  worked: C.green, "leaning-good": C.teal, nothing: C.muted, "leaning-bad": C.orange, backfired: C.red, "too-early": C.faint,
};

// ---- A picture of the data -----------------------------------------------------------------
// Every day on one line, coloured by which side of the test it was on, with each side's average
// drawn across. Seeing the days is what lets someone judge the verdict rather than take it on trust.
function DayPlot({ result, exp }) {
  const pts = result.series.filter((s) => s.value !== null);
  if (pts.length < 2) return null;
  const W = 320, H = 118, padX = 26, padY = 16;
  const vals = pts.map((p) => p.value);
  const lo = Math.min(0, ...vals), hi = Math.max(...vals, lo + 1);
  const x = (i) => padX + (i / Math.max(1, result.series.length - 1)) * (W - padX * 2);
  const y = (v) => H - padY - ((v - lo) / (hi - lo)) * (H - padY * 2);
  const arms = { do: C.gold, skip: C.muted, before: C.muted, after: C.gold };
  const label = { do: "Did it", skip: "Didn't", before: "Before", after: "Since" };
  const present = [...new Set(result.series.filter((s) => s.value !== null).map((s) => s.arm))];
  const meanOf = (arm) => {
    const v = result.series.filter((s) => s.arm === arm && s.value !== null).map((s) => s.value);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const fmt = (v) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
  const kind = KIND_BY_ID[exp.metric.kind] || {};
  return (
    <div style={{ marginTop: 12 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`Each day's ${(kind.label || "value").toLowerCase()}, split by ${exp.mode === "flip" ? "days you did it and days you didn't" : "before and since"}`}
        style={{ display: "block", maxWidth: "100%" }}>
        <line x1={padX} x2={W - padX} y1={y(lo)} y2={y(lo)} stroke={C.border} strokeWidth="1" />
        <text x={4} y={y(lo) + 3} fill={C.faint} fontSize="9">{kind.percent ? `${Math.round(lo * 100)}%` : fmt(lo)}</text>
        <text x={4} y={y(hi) + 3} fill={C.faint} fontSize="9">{kind.percent ? `${Math.round(hi * 100)}%` : fmt(hi)}</text>
        {present.map((arm) => {
          const m = meanOf(arm);
          return m === null ? null : (
            <line key={arm} x1={padX} x2={W - padX} y1={y(m)} y2={y(m)} stroke={arms[arm]} strokeWidth="1.4" strokeDasharray="4 3" opacity="0.7" />
          );
        })}
        {result.series.map((s, i) => s.value === null ? null : (
          <circle key={`${s.date}-${s.arm}`} cx={x(i)} cy={y(s.value)} r="3.6"
            fill={s.arm === "skip" || s.arm === "before" ? "none" : arms[s.arm]}
            stroke={arms[s.arm]} strokeWidth="1.6" />
        ))}
      </svg>
      <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
        {present.map((arm) => (
          <span key={arm} style={{ color: C.muted, fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <i style={{ width: 9, height: 9, borderRadius: 5, border: `1.6px solid ${arms[arm]}`, background: arm === "skip" || arm === "before" ? "transparent" : arms[arm], display: "inline-block" }} />
            {label[arm]}{meanOf(arm) !== null ? ` · avg ${kind.percent ? `${Math.round(meanOf(arm) * 100)}%` : fmt(meanOf(arm))}` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function ResultBody({ exp, state, result }) {
  const words = describeResult(result, exp);
  const tone = TONE[result.verdict];
  return (
    <>
      <p style={{ color: tone, fontSize: 17, fontWeight: 700, fontFamily: F.display, margin: "12px 0 0", lineHeight: 1.3 }}>
        {words.headline}
      </p>
      {words.numbers && <p style={{ color: C.text, fontSize: 13, lineHeight: 1.55, margin: "6px 0 0" }}>{words.numbers}</p>}
      <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.6, margin: "6px 0 0" }}>{words.body}</p>
      <DayPlot result={result} exp={exp} />
      <details style={{ marginTop: 10 }}>
        <summary style={{ color: C.muted, fontSize: 12, cursor: "pointer" }}>How much to trust this</summary>
        <ul style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.6, margin: "6px 0 0", paddingLeft: 18 }}>
          {result.caveats.map((c) => <li key={c}>{c}</li>)}
          <li>
            {exp.mode === "flip"
              ? `${result.n} complete pair${result.n === 1 ? "" : "s"} compared. The check asks how often chance alone, flipping which day of each pair got the change, would split things this far.`
              : `${result.n} days each side compared, shuffled thousands of times to see how often chance alone splits them this far.`}
          </li>
        </ul>
      </details>
    </>
  );
}

function RunCard({ exp, state, onStop, onFollow, onOpenDelete }) {
  const today = todayStr();
  const phase = phaseOf(exp, today);
  const result = useMemo(() => analyze(exp, state, asOf(exp, today)), [exp, state, today]);
  const asked = todayAssignment(exp, today);
  const adh = adherence(exp, today);
  const [sure, setSure] = useState(false);
  return (
    <Card style={{ marginBottom: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <FlaskConical size={14} color={C.teal} />
        <span style={{ color: C.teal, fontSize: 11, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase" }}>
          {phase === "upcoming" ? `Starts ${prettyDate(exp.startDate)}` : `Day ${dayNumber(exp, today)} of ${exp.days}`}
          {exp.mode === "flip" ? " · coin-flip days" : " · before / after"}
        </span>
      </div>
      <p style={{ color: C.text, fontSize: 15.5, fontWeight: 650, margin: "8px 0 0", fontFamily: F.display }}>{exp.title}</p>
      <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: "3px 0 0" }}>{exp.change}</p>
      <p style={{ color: C.faint, fontSize: 11.5, margin: "6px 0 0" }}>
        Measuring {describeMetric(exp.metric, state)} · ends {prettyDate(endDateOf(exp))}
      </p>

      {asked && (
        <p style={{ color: asked === "do" ? C.gold : C.muted, fontSize: 12.5, fontWeight: 650, margin: "10px 0 0" }}>
          Today: {asked === "do" ? "do it" : "a normal day"}
          {asked === "do" && (
            <button onClick={() => onFollow(exp.id, today, !exp.followed?.[today])} aria-pressed={!!exp.followed?.[today]}
              style={{ ...styles.linkBtn, marginLeft: 10, color: exp.followed?.[today] ? C.green : C.gold }}>
              <Check size={12} /> {exp.followed?.[today] ? "Done" : "Mark done"}
            </button>
          )}
        </p>
      )}

      <ResultBody exp={exp} state={state} result={result} />
      {adh.due > 0 && (
        <p style={{ color: C.faint, fontSize: 11.5, margin: "8px 0 0" }}>
          Followed on {adh.done} of {adh.due} day{adh.due === 1 ? "" : "s"} it asked.
        </p>
      )}

      <div style={{ marginTop: 12 }}>
        {!sure ? (
          <button onClick={() => setSure(true)} style={{ ...styles.linkBtn, color: C.muted }}>Stop this experiment</button>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: C.muted, fontSize: 12 }}>Stop it and keep what it found so far?</span>
            <button onClick={() => onStop(exp.id)} style={{ ...styles.ghostCta, width: "auto", height: 34, padding: "0 14px", fontSize: 12.5, borderColor: alpha(C.red, 0.5), color: C.red }}>Stop</button>
            <button onClick={() => setSure(false)} style={{ ...styles.linkBtn, color: C.muted }}>Keep going</button>
          </div>
        )}
      </div>
    </Card>
  );
}

function DoneCard({ exp, state, onAddHabit, onRunAgain, onDelete }) {
  const today = todayStr();
  const result = useMemo(() => analyze(exp, state, asOf(exp, today)), [exp, state, today]);
  const [sure, setSure] = useState(false);
  const good = result.verdict === "worked" || result.verdict === "leaning-good";
  const [added, setAdded] = useState(false);
  return (
    <Card style={{ marginBottom: 0, borderColor: alpha(TONE[result.verdict], 0.35) }}>
      <span style={{ color: C.faint, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" }}>
        Finished {prettyDate(stoppedDate(exp) || endDateOf(exp))}
        {exp.mode === "flip" ? " · coin-flip days" : " · before / after"}
      </span>
      <p style={{ color: C.text, fontSize: 15.5, fontWeight: 650, margin: "6px 0 0", fontFamily: F.display }}>{exp.title}</p>
      <p style={{ color: C.muted, fontSize: 12.5, margin: "3px 0 0" }}>{exp.change} · {describeMetric(exp.metric, state)}</p>
      <ResultBody exp={exp} state={state} result={result} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {good && (
          <button disabled={added} onClick={() => { onAddHabit(exp.change); setAdded(true); }}
            style={{ ...styles.cta, width: "auto", height: 38, padding: "0 16px", fontSize: 12.5 }}>
            <Sprout size={14} /> {added ? "Added to habits" : "Make it a habit"}
          </button>
        )}
        <button onClick={() => onRunAgain(exp)} style={{ ...styles.ghostCta, width: "auto", height: 38, padding: "0 14px", fontSize: 12.5 }}>
          <Repeat size={13} /> Run it again
        </button>
        {!sure
          ? <button onClick={() => setSure(true)} style={{ ...styles.linkBtn, color: C.muted }}><Trash2 size={12} /> Delete</button>
          : <button onClick={() => onDelete(exp.id)} style={{ ...styles.linkBtn, color: C.red }}>Delete for good?</button>}
      </div>
    </Card>
  );
}

// ---- Setting one up ------------------------------------------------------------------------
function NewSheet({ open, onClose, state, onCreate, prefill }) {
  const quits = state.tasks.filter((t) => t.kind === "break" && !t.archivedAt);
  const builds = state.tasks.filter((t) => t.kind === "build" && t.recurrence && !t.archivedAt);
  const [starter, setStarter] = useState(null);
  const [title, setTitle] = useState(prefill?.title || "");
  const [change, setChange] = useState(prefill?.change || "");
  const [kind, setKind] = useState(prefill?.metric?.kind || "recharge");
  const [taskId, setTaskId] = useState(prefill?.metric?.taskId || "");
  const [pillarId, setPillarId] = useState(prefill?.metric?.pillarId || "health");
  const [mode, setMode] = useState(prefill?.mode || "flip");
  const [days, setDays] = useState(14);
  const [startOn, setStartOn] = useState("today");

  const kinds = METRIC_KINDS.filter((k) => (k.needs === "break" ? quits.length : k.needs === "build" ? builds.length : true));
  const metric = { kind, ...(taskId ? { taskId } : {}), ...(kind === "pillar" ? { pillarId } : {}) };
  const kindInfo = KIND_BY_ID[kind];
  const needsTask = kindInfo?.needs === "break" || kindInfo?.needs === "build";
  const effectiveMetric = needsTask && !taskId ? { ...metric, taskId: (kindInfo.needs === "break" ? quits : builds)[0]?.id } : metric;
  const problem = metricProblem(effectiveMetric, state);
  const ready = change.trim().length > 1 && !problem;
  const flip = mode === "flip";
  const startDate = startOn === "today" ? todayStr() : addDays(todayStr(), 1);

  const pick = (s) => {
    setStarter(s.id); setTitle(s.title); setChange(s.change); setKind(s.metric.kind); setMode(s.mode);
  };
  const create = () => {
    if (!ready) return;
    onCreate(newExperiment({ title, change, metric: effectiveMetric, mode, days, startDate }));
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="New experiment">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <p style={{ color: C.muted, fontSize: 10.5, margin: "0 0 7px", letterSpacing: 0.4, textTransform: "uppercase" }}>Start from an idea</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STARTERS.map((s) => <Pill key={s.id} on={starter === s.id} onClick={() => pick(s)}>{s.title}</Pill>)}
          </div>
        </div>

        <div>
          <p style={{ color: C.muted, fontSize: 10.5, margin: "0 0 7px", letterSpacing: 0.4, textTransform: "uppercase" }}>The change</p>
          <input id="exp-change" value={change} onChange={(e) => { setChange(e.target.value); setStarter(null); }}
            placeholder="What exactly will you do?" aria-label="The change" style={styles.input} />
          <p style={{ color: C.faint, fontSize: 11, lineHeight: 1.5, margin: "6px 0 0" }}>
            Something you can do or not do on any given day, and can tell afterwards whether you did.
          </p>
        </div>

        <div>
          <p style={{ color: C.muted, fontSize: 10.5, margin: "0 0 7px", letterSpacing: 0.4, textTransform: "uppercase" }}>What should it move?</p>
          <select id="exp-kind" value={kind} onChange={(e) => { setKind(e.target.value); setTaskId(""); }}
            aria-label="What to measure" style={{ ...styles.input, appearance: "auto" }}>
            {kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
          <p style={{ color: C.faint, fontSize: 11, lineHeight: 1.5, margin: "6px 0 0" }}>{kindInfo?.about} {kindInfo?.better === "down" ? "Lower is better." : "Higher is better."}</p>
          {needsTask && (
            <select id="exp-task" value={taskId || (kindInfo.needs === "break" ? quits : builds)[0]?.id || ""} onChange={(e) => setTaskId(e.target.value)}
              aria-label="Which habit" style={{ ...styles.input, appearance: "auto", marginTop: 8 }}>
              {(kindInfo.needs === "break" ? quits : builds).map((t) => <option key={t.id} value={t.id}>{t.text}</option>)}
            </select>
          )}
          {kind === "pillar" && (
            <select id="exp-pillar" value={pillarId} onChange={(e) => setPillarId(e.target.value)}
              aria-label="Which pillar" style={{ ...styles.input, appearance: "auto", marginTop: 8 }}>
              {PILLARS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>

        <div>
          <p style={{ color: C.muted, fontSize: 10.5, margin: "0 0 7px", letterSpacing: 0.4, textTransform: "uppercase" }}>How to test it</p>
          <SegmentedControl value={mode} onChange={setMode} options={[
            { id: "flip", label: "Coin-flip days" }, { id: "before-after", label: "Before / after" },
          ]} />
          <p style={{ color: C.faint, fontSize: 11, lineHeight: 1.55, margin: "8px 0 0" }}>
            {flip
              ? "Strongest. Days come in pairs and a coin picks which one you do it on, so the weekday, your mood and everything else lands on both sides. Best for things you can switch on and off."
              : "For changes you can't switch on and off daily. It compares the days before you start with the days since — and can't rule out something else having changed at the same time."}
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <p style={{ color: C.muted, fontSize: 10.5, margin: "0 0 7px", letterSpacing: 0.4, textTransform: "uppercase" }}>Length</p>
            <SegmentedControl value={days} onChange={setDays} options={[{ id: 14, label: "14 days" }, { id: 21, label: "21" }, { id: 28, label: "28" }]} />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <p style={{ color: C.muted, fontSize: 10.5, margin: "0 0 7px", letterSpacing: 0.4, textTransform: "uppercase" }}>Start</p>
            <SegmentedControl value={startOn} onChange={setStartOn} options={[{ id: "today", label: "Today" }, { id: "tomorrow", label: "Tomorrow" }]} />
          </div>
        </div>

        <div style={{ background: alpha(C.teal, 0.08), border: `1px solid ${alpha(C.teal, 0.25)}`, borderRadius: R.md, padding: "11px 13px" }}>
          <p style={{ color: C.text, fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
            <Dices size={13} style={{ verticalAlign: -2, marginRight: 6 }} color={C.teal} />
            {flip
              ? `${Math.floor(days / 2)} days you do it, ${Math.floor(days / 2)} you don't, in random pairs. The plan is fixed the moment you start. A first read is possible after about ten days.`
              : `The app uses your last 14 days as the starting point, then watches ${days} days of the change. A first read is possible after about a week.`}
          </p>
        </div>
        {problem && change.trim().length > 1 && <p role="alert" style={{ color: C.orange, fontSize: 12, margin: 0 }}>{problem}</p>}

        <button onClick={create} disabled={!ready} style={{ ...styles.cta, height: 46, opacity: ready ? 1 : 0.45 }}>
          <FlaskConical size={16} /> Start the experiment
        </button>
      </div>
    </Sheet>
  );
}

// ---- The screen ----------------------------------------------------------------------------
export default function ExperimentsView({ state, onBack, onCreate, onFollow, onStop, onDelete, onAddHabit, startOpen = false }) {
  const [creating, setCreating] = useState(startOpen);
  const [prefill, setPrefill] = useState(null);
  const today = todayStr();
  const all = state.experiments || [];
  const active = all.filter((e) => phaseOf(e, today) !== "ended").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const ended = all.filter((e) => phaseOf(e, today) === "ended").sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div style={styles.page}>
      <button onClick={onBack} style={styles.back}>Back</button>
      <h1 style={styles.h1}>Experiments</h1>
      <p style={styles.lede}>
        Test what actually works for you. The app picks, by coin flip, which days you do the thing,
        then tells you honestly whether it made a difference — including when the honest answer is
        "nothing".
      </p>

      <button onClick={() => { setPrefill(null); setCreating(true); }} style={{ ...styles.cta, height: 46, marginBottom: 18 }}>
        <Plus size={16} /> Start an experiment
      </button>

      {all.length === 0 && (
        <EmptyState Icon={FlaskConical} title="Nothing under test yet"
          hint="Pick one change — phone out of the bedroom, no caffeine after noon — and one thing it should move. Two weeks later you'll know." />
      )}

      {active.length > 0 && (
        <>
          <SectionLabel>Running · {active.length}</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {active.map((e) => <RunCard key={e.id} exp={e} state={state} onStop={onStop} onFollow={onFollow} />)}
          </div>
        </>
      )}

      {ended.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 22 }}>Finished · {ended.length}</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ended.map((e) => (
              <DoneCard key={e.id} exp={e} state={state} onAddHabit={onAddHabit} onDelete={onDelete}
                onRunAgain={(x) => { setPrefill(x); setCreating(true); }} />
            ))}
          </div>
        </>
      )}

      {/* Keyed so a "run it again" starts from that experiment rather than from the last form. */}
      <NewSheet key={prefill?.id || "new"} open={creating} onClose={() => setCreating(false)} state={state}
        onCreate={onCreate} prefill={prefill} />
    </div>
  );
}
