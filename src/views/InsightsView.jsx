import React, { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Ban, Flame, Lightbulb, Minus, Plus, Snowflake,
  Target, Timer, Trash2, TrendingUp, Trophy,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { NO_PILLAR, PILLARS, P_BY_ID } from "../data/constants.js";
import { fmtDuration, focusTotals } from "../lib/focus.js";
import { goalProgress } from "../lib/planning.js";
import { automaticityReport } from "../lib/automaticity.js";
import { addDays, prettyDate, todayStr } from "../lib/date.js";
import { dayStats, isDone } from "../lib/tasks.js";
import {
  SPANS, balanceOf, blockerImpact, buildFindings, checkinsIn, delta, eachDay, energizerImpact,
  habitMoodLink, habitTrends, metricsFor, moodCounts, narrative, periodRange, pillarMovement,
  weekdayBalance, weekdayPattern,
} from "../lib/insights.js";
import {
  Card, Checkbox, EmptyState, Pill, ProgressBar, SegmentedControl, SectionLabel,
} from "../components/ui.jsx";

const tooltipStyle = {
  background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 12,
};

export default function InsightsView({ state, streak, onAddGoal, onUpdateGoal, onRemoveGoal }) {
  const [span, setSpan] = useState("month");
  const [tab, setTab] = useState("overview");
  const [pid, setPid] = useState("overall");
  const [gpid, setGpid] = useState(PILLARS[0].id);
  const [gtext, setGtext] = useState("");

  const range = useMemo(() => periodRange(state, span), [state, span]);
  const cur = useMemo(() => metricsFor(state, range.from, range.to), [state, range]);
  const prev = useMemo(() => metricsFor(state, range.prevFrom, range.prevTo), [state, range]);
  const findings = useMemo(() => buildFindings(state, range), [state, range]);
  const pillars = useMemo(
    () => pillarMovement(state.checkins, range.from, range.to, range.prevFrom, range.prevTo),
    [state.checkins, range]);
  const weekdays = useMemo(
    () => weekdayPattern(state.tasks, state.dayLog, range.from, range.to),
    [state.tasks, state.dayLog, range]);
  const habits = useMemo(
    () => habitTrends(state, range.from, range.to, range.prevFrom, range.prevTo),
    [state, range]);

  const hasAnything = cur.logged > 0 || cur.habitScheduled > 0 || cur.tasksDone > 0;

  return (
    <div style={styles.page}>
      <p style={styles.eyebrow}>Look back</p>
      <h1 style={styles.h1}>Insights</h1>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
        {SPANS.map((s) => (
          <Pill key={s.id} on={span === s.id} onClick={() => setSpan(s.id)}>{s.label}</Pill>
        ))}
      </div>

      <SegmentedControl
        value={tab} onChange={setTab} style={{ marginBottom: 16 }}
        options={[
          { id: "overview", label: "Overview" },
          { id: "habits", label: "Habits" },
          { id: "patterns", label: "Patterns" },
        ]}
      />

      {!hasAnything ? (
        <EmptyState
          Icon={TrendingUp} title="Nothing to analyse yet"
          hint="Check in, finish a habit or clear a task — this fills in with real patterns, not just counts."
        />
      ) : tab === "overview" ? (
        <Overview state={state} cur={cur} prev={prev} range={range} pillars={pillars}
          streak={streak} pid={pid} setPid={setPid}
          gpid={gpid} setGpid={setGpid} gtext={gtext} setGtext={setGtext}
          onAddGoal={onAddGoal} onUpdateGoal={onUpdateGoal} onRemoveGoal={onRemoveGoal} />
      ) : tab === "habits" ? (
        <Habits state={state} cur={cur} prev={prev} range={range} weekdays={weekdays} habits={habits} />
      ) : (
        <Patterns state={state} range={range} findings={findings} />
      )}
    </div>
  );
}

// The one comparison this app can make that a streak cannot: how reliably you do a thing
// against how automatic it actually feels. They diverge, and the divergence is the point —
// 93% completion at 3/7 automaticity means it is still costing you something every time.
function AutomaticityBreakdown({ state }) {
  const rows = useMemo(
    () => automaticityReport(state.tasks, state.srbai || [], state.dayLog),
    [state.tasks, state.srbai, state.dayLog]);
  const measured = rows.filter((r) => r.mean !== null);
  if (!measured.length) return null;

  const graduated = measured.filter((r) => r.status.id === "graduated");
  const effortful = measured.filter((r) => r.effortfulButKept);

  return (
    <>
      <SectionLabel>Doing it vs. not deciding to</SectionLabel>
      <Card>
        <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: "0 0 14px" }}>
          The left number is how often you do it. The right is how automatic it feels, on the
          SRBAI. A habit is finished when the second one catches up with the first.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {measured.map((r) => {
            const grad = r.status.id === "graduated";
            return (
              <div key={r.task.id}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
                  <span style={{
                    flex: 1, minWidth: 0, color: C.text, fontSize: 12.5, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {r.task.text}
                  </span>
                  <span style={{ color: C.muted, fontSize: 11.5 }}>{r.pct ?? "—"}%</span>
                  <span style={{ color: grad ? C.green : C.gold, fontSize: 11.5, minWidth: 30, textAlign: "right" }}>
                    {r.mean}/7
                  </span>
                </div>
                <div style={{ display: "flex", gap: 3, height: 5 }}>
                  <span style={{ flex: 1, background: C.surface3, borderRadius: 3, overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${r.pct ?? 0}%`, background: C.muted }} />
                  </span>
                  <span style={{ flex: 1, background: C.surface3, borderRadius: 3, overflow: "hidden" }}>
                    <span style={{
                      display: "block", height: "100%",
                      width: `${Math.round((r.mean / 7) * 100)}%`,
                      background: grad ? C.green : C.gold,
                    }} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {effortful.length > 0 && (
          <p style={{ color: C.orange, fontSize: 11.5, lineHeight: 1.55, margin: "14px 0 0" }}>
            {effortful.length === 1
              ? `“${effortful[0].task.text}” is getting done but still costs you something every time.`
              : `${effortful.length} habits are getting done but still cost you something every time.`}
            {" "}Kept by effort, not by cue — worth anchoring better rather than pushing harder.
          </p>
        )}
        {graduated.length > 0 && (
          <p style={{ color: C.green, fontSize: 11.5, lineHeight: 1.55, margin: "10px 0 0" }}>
            {graduated.length} graduated — prompts and rewards have come off those.
          </p>
        )}
      </Card>
    </>
  );
}

// Time logged against a task is the one number here that isn't self-reported after the fact,
// so it earns its own breakdown rather than sitting as a single figure in the grid.
function FocusBreakdown({ state, range }) {
  const totals = useMemo(
    () => focusTotals(state.focusSessions, range.from, range.to), [state.focusSessions, range]);
  if (!totals.count) return null;

  const pillars = Object.entries(totals.byPillar)
    .map(([id, seconds]) => ({ ...(P_BY_ID[id] || NO_PILLAR), seconds }))
    .sort((a, b) => b.seconds - a.seconds);
  const pillarTotal = pillars.reduce((a, p) => a + p.seconds, 0);

  return (
    <>
      <SectionLabel>Where the hours went</SectionLabel>
      <Card>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
          <span style={{ color: C.text, fontFamily: F.display, fontSize: 26, fontWeight: 600 }}>
            {fmtDuration(totals.seconds)}
          </span>
          <span style={{ color: C.muted, fontSize: 12 }}>
            across {totals.count} session{totals.count === 1 ? "" : "s"}
          </span>
        </div>

        {pillarTotal > 0 && (
          <div style={{ display: "flex", gap: 2, height: 8, marginBottom: 10 }}>
            {pillars.map((p) => (
              <span key={p.id || "none"} title={`${p.name} · ${fmtDuration(p.seconds)}`} style={{
                // Several pillar colours sit close together; a hairline between segments is
                // what makes the split readable at a glance.
                width: `${(p.seconds / pillarTotal) * 100}%`, background: p.color, borderRadius: 4,
              }} />
            ))}
          </div>
        )}
        {pillars.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {pillars.map((p) => (
              <span key={p.id || "none"} style={{
                ...styles.tag, color: p.color, background: alpha(p.color, 0.13),
              }}>
                {p.name} {fmtDuration(p.seconds)}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {totals.topTasks.slice(0, 5).map((t) => (
            <div key={t.text} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                flex: 1, minWidth: 0, color: C.text, fontSize: 12.5, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {t.text}
              </span>
              <span style={{ color: C.faint, fontSize: 10.5 }}>×{t.count}</span>
              <span style={{ color: C.muted, fontSize: 12, minWidth: 52, textAlign: "right" }}>
                {fmtDuration(t.seconds)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ---------------- Overview ---------------- */
function Overview({
  state, cur, prev, range, pillars, streak, pid, setPid,
  gpid, setGpid, gtext, setGtext, onAddGoal, onUpdateGoal, onRemoveGoal,
}) {
  const sorted = useMemo(
    () => [...state.checkins].sort((a, b) => a.date.localeCompare(b.date)), [state.checkins]);

  const trend = useMemo(() => checkinsIn(sorted, range.from, range.to).map((c) => ({
    date: prettyDate(c.date),
    value: pid === "overall" ? round(balanceOf(c)) : (c.scores?.[pid] ?? null),
  })), [sorted, range, pid]);

  const active = pid === "overall" ? { name: "Balance", color: C.gold } : P_BY_ID[pid];
  const addGoal = () => {
    if (!gtext.trim()) return;
    onAddGoal({ id: Date.now(), pillar: gpid, text: gtext.trim(), done: false, notes: "", subtasks: [], starred: false });
    setGtext("");
  };

  return (
    <>
      <Card flip style={styles.cardTall}>
        <p style={{ color: C.text, fontSize: 14, lineHeight: 1.65, margin: 0, fontFamily: F.display }}>
          {narrative(cur, prev, range)}
        </p>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
        <Metric label="Balance" value={cur.balance ?? "—"} sub="/ 5" change={delta(cur.balance, prev.balance)} />
        <Metric label="Habits" value={cur.habitPct === null ? "—" : `${cur.habitPct}%`}
          change={delta(cur.habitPct, prev.habitPct)} />
        <Metric label="Streak" value={streak} sub="d" Icon={Flame} />
        <Metric label="Tasks" value={cur.tasksDone} change={delta(cur.tasksDone, prev.tasksDone)} />
        <Metric label="Logged" value={cur.logged} sub={`/ ${cur.days}`}
          change={delta(cur.logged, prev.logged)} />
        <Metric label="Clean sweeps" value={cur.perfectDays} sub={`/ ${cur.scheduledDays}`}
          change={delta(cur.perfectDays, prev.perfectDays)} />
        {cur.breakPct !== null && (
          <Metric label="Avoided" value={`${cur.breakPct}%`} Icon={Ban}
            change={delta(cur.breakPct, prev.breakPct)} />
        )}
        {cur.savingsRate !== null && (
          <Metric label="Saved" value={`${cur.savingsRate}%`} change={delta(cur.savingsRate, prev.savingsRate)} />
        )}
        {cur.feel !== null && (
          <Metric label="Energy" value={cur.feel} sub="/ 5" change={delta(cur.feel, prev.feel)} />
        )}
        {cur.recharge !== null && (
          <Metric label="Recharge" value={cur.recharge} sub="/ 5" change={delta(cur.recharge, prev.recharge)} />
        )}
        {cur.focusSeconds > 0 && (
          <Metric label="Focus" value={fmtDuration(cur.focusSeconds)} Icon={Timer}
            change={delta(Math.round(cur.focusSeconds / 60), Math.round((prev.focusSeconds || 0) / 60))} />
        )}
        {cur.milestones > 0 && <Metric label="Milestones" value={cur.milestones} Icon={Trophy} />}
        {cur.freezesUsed > 0 && <Metric label="Freezes" value={cur.freezesUsed} Icon={Snowflake} />}
      </div>

      <AutomaticityBreakdown state={state} />

      <FocusBreakdown state={state} range={range} />

      <SectionLabel>Pillar movement</SectionLabel>
      <Card>
        {pillars.every((p) => p.value === null) ? (
          <p style={{ color: C.muted, fontSize: 12.5, margin: 0, lineHeight: 1.55 }}>
            No check-ins in this window — the pillars fill in as you log.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pillars.map((p) => (
              <div key={p.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                  <span style={{ color: C.text, fontSize: 12.5 }}>{p.name}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <ChangeChip change={p.change} suffix="" />
                    <span style={{ color: C.muted, fontSize: 11.5, minWidth: 22, textAlign: "right" }}>
                      {p.value ?? "—"}
                    </span>
                  </span>
                </div>
                <ProgressBar pct={((p.value || 0) / 5) * 100} color={p.color} height={5} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <SectionLabel>Trend</SectionLabel>
      <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 12, margin: "0 -18px", padding: "0 18px 12px" }}>
        {[{ id: "overall", name: "Balance", color: C.gold }, ...PILLARS].map((p) => (
          <Pill key={p.id} on={pid === p.id} color={p.color} onClick={() => setPid(p.id)}>{p.name}</Pill>
        ))}
      </div>
      {trend.length < 2 ? (
        <Card><EmptyState Icon={TrendingUp} title="Two check-ins and the line starts to grow" hint="Keep going." /></Card>
      ) : (
        <Card style={{ height: 230, padding: "16px 6px 4px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 6, right: 12, bottom: 4, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fill: C.faint, fontSize: 10 }}
                tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              {prev.balance !== null && pid === "overall" && (
                <ReferenceLine y={prev.balance} stroke={C.faint} strokeDasharray="4 4"
                  label={{ value: `prev ${prev.balance}`, fill: C.faint, fontSize: 9, position: "insideTopRight" }} />
              )}
              <Line type="monotone" dataKey="value" stroke={active.color} strokeWidth={2.4}
                dot={{ r: 3, fill: active.color, strokeWidth: 0 }} connectNulls name={active.name} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <SectionLabel>Intentions</SectionLabel>
      <Card>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 11 }}>
          {PILLARS.map((p) => (
            <Pill key={p.id} on={gpid === p.id} color={p.color} onClick={() => setGpid(p.id)}>{p.name}</Pill>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={gtext} onChange={(e) => setGtext(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGoal()}
            placeholder="Set an intention…" style={{ ...styles.input, flex: 1 }} />
          <button onClick={addGoal} style={styles.addBtn}><Plus size={20} /></button>
        </div>
      </Card>

      {state.goals.length === 0 ? (
        <EmptyState Icon={Target} title="No intentions set"
          hint="Name one thing you want to move on, in any pillar." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {state.goals.map((g) => {
            const p = P_BY_ID[g.pillar] || NO_PILLAR;
            const prog = goalProgress(g, state.tasks, state.dayLog);
            return (
              <Card key={g.id} style={{ marginBottom: 0, padding: "13px 14px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <Checkbox checked={g.done} color={p.color} size={23}
                    onClick={() => onUpdateGoal(g.id, { done: !g.done })} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      color: g.done ? C.faint : C.text, fontSize: 14,
                      textDecoration: g.done ? "line-through" : "none",
                    }}>{g.text}</span>
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      <span style={{ width: 7, height: 7, borderRadius: 4, background: p.color }} />
                      <span style={{ color: C.faint, fontSize: 11 }}>{p.name}</span>
                      {prog.linked > 0 && (
                        <span style={{ color: C.faint, fontSize: 11 }}>
                          · {prog.todos > 0 ? `${prog.doneTodos}/${prog.todos} tasks` : null}
                          {prog.todos > 0 && prog.habits > 0 ? " · " : null}
                          {prog.habits > 0 ? `${prog.habits} habit${prog.habits === 1 ? "" : "s"}` : null}
                        </span>
                      )}
                    </div>
                    {/* Progress earned from linked work, not a number anyone typed in. */}
                    {prog.linked > 0 && !g.done && (
                      <div style={{ marginTop: 8 }}>
                        <ProgressBar pct={prog.pct} color={p.color} height={5} />
                        <span style={{ color: C.faint, fontSize: 10.5, marginTop: 4, display: "block" }}>
                          {prog.pct}% from work you've actually finished
                        </span>
                      </div>
                    )}
                    <input value={g.notes || ""} placeholder="Add a note…"
                      onChange={(e) => onUpdateGoal(g.id, { notes: e.target.value })}
                      style={{
                        ...styles.input, marginTop: 9, fontSize: 12, padding: "8px 11px",
                        background: "transparent", borderStyle: "dashed",
                      }} />
                  </div>
                  <button onClick={() => onRemoveGoal(g.id)} style={{
                    background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 4,
                  }}><Trash2 size={15} /></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ---------------- Habits ---------------- */
function Habits({ state, cur, prev, range, weekdays, habits }) {
  const consistency = useMemo(() => eachDay(range.from, range.to).map((d) => {
    const s = dayStats(state.tasks, d, state.dayLog, "build");
    return { date: prettyDate(d), pct: s.ratio === null ? null : Math.round(s.ratio * 100) };
  }), [state.tasks, state.dayLog, range]);

  const scheduled = weekdays.filter((d) => d.scheduled > 0);
  const worst = scheduled.length ? [...scheduled].sort((a, b) => a.pct - b.pct)[0] : null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
        <Metric label="Completion" value={cur.habitPct === null ? "—" : `${cur.habitPct}%`}
          change={delta(cur.habitPct, prev.habitPct)} />
        <Metric label="Reps done" value={cur.habitDone} sub={`/ ${cur.habitScheduled}`}
          change={delta(cur.habitDone, prev.habitDone)} />
        <Metric label="Clean sweeps" value={cur.perfectDays} sub={`/ ${cur.scheduledDays}`}
          change={delta(cur.perfectDays, prev.perfectDays)} />
      </div>

      <SectionLabel>Consistency</SectionLabel>
      <Card style={{ height: 180, padding: "16px 6px 4px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={consistency} margin={{ top: 6, right: 12, bottom: 4, left: -22 }}>
            <defs>
              <linearGradient id="consfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.gold} stopOpacity={0.45} />
                <stop offset="100%" stopColor={C.gold} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 9.5 }} tickLine={false} axisLine={false}
              interval={Math.max(0, Math.floor(consistency.length / 6))} />
            <YAxis domain={[0, 100]} tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, "Completed"]} />
            {prev.habitPct !== null && (
              <ReferenceLine y={prev.habitPct} stroke={C.faint} strokeDasharray="4 4"
                label={{ value: `prev ${prev.habitPct}%`, fill: C.faint, fontSize: 9, position: "insideTopRight" }} />
            )}
            <Area type="monotone" dataKey="pct" stroke={C.gold} strokeWidth={2} fill="url(#consfill)" connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <SectionLabel>Which days you actually show up</SectionLabel>
      <Card>
        <div style={{ display: "flex", gap: 5 }}>
          {weekdays.map((d) => {
            const color = d.pct === null ? C.surface2 : d.pct >= 70 ? C.green : d.pct >= 40 ? C.gold : C.red;
            return (
              <div key={d.key} style={{ flex: 1, textAlign: "center" }}>
                <div title={`${d.label}: ${d.done}/${d.scheduled}`} style={{
                  height: 62, borderRadius: 9, background: alpha(color, d.pct === null ? 0.25 : 0.18),
                  border: `1px solid ${d.pct === null ? C.border : alpha(color, 0.45)}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                  padding: 4, position: "relative", overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute", left: 0, right: 0, bottom: 0,
                    height: `${d.pct || 0}%`, background: alpha(color, 0.5),
                  }} />
                  <span style={{ color: C.text, fontSize: 10.5, fontWeight: 600, zIndex: 1 }}>
                    {d.pct === null ? "—" : `${d.pct}%`}
                  </span>
                </div>
                <span style={{ color: C.muted, fontSize: 10, display: "block", marginTop: 5 }}>{d.letter}</span>
              </div>
            );
          })}
        </div>
        {worst && worst.pct !== null && worst.pct < 60 && (
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: "14px 0 0" }}>
            <b style={{ color: C.red }}>{worst.full}</b> is where it breaks down — {worst.done} of{" "}
            {worst.scheduled} done. Moving or shrinking what's scheduled there beats trying harder.
          </p>
        )}
      </Card>

      <SectionLabel>Per habit</SectionLabel>
      {habits.length === 0 ? (
        <EmptyState Icon={Flame} title="No habits scheduled in this window"
          hint="Add a habit and its reliability shows up here." />
      ) : (
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {habits.map((h) => {
              const color = h.pct >= 70 ? C.green : h.pct >= 40 ? C.gold : C.red;
              return (
                <div key={h.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, gap: 8 }}>
                    <span style={{ color: C.text, fontSize: 12.5, flex: 1, minWidth: 0 }}>{h.text}</span>
                    <ChangeChip change={h.change === null ? null : { diff: h.change, dir: h.change > 0 ? "up" : h.change < 0 ? "down" : "flat" }} suffix="pt" />
                    <span style={{ color, fontSize: 11.5, fontWeight: 600 }}>{h.pct}% · {h.done}/{h.scheduled}</span>
                  </div>
                  <ProgressBar pct={h.pct} color={color} height={5} />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {cur.breakPct !== null && (
        <>
          <SectionLabel>Staying away</SectionLabel>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ color: C.text, fontSize: 13 }}>Days you stayed clean</span>
              <span style={{ color: cur.breakPct >= 70 ? C.green : C.red, fontSize: 13, fontWeight: 600 }}>
                {cur.breakPct}%
              </span>
            </div>
            <ProgressBar pct={cur.breakPct} color={cur.breakPct >= 70 ? C.green : C.red} />
          </Card>
        </>
      )}
    </>
  );
}

/* ---------------- Patterns ---------------- */
function Patterns({ state, range, findings }) {
  const cs = useMemo(() => checkinsIn(state.checkins, range.from, range.to), [state.checkins, range]);
  const energizers = useMemo(() => energizerImpact(cs), [cs]);
  const blockers = useMemo(() => blockerImpact(cs), [cs]);
  const link = useMemo(() => habitMoodLink(state, range.from, range.to), [state, range]);
  const wkBalance = useMemo(() => weekdayBalance(state.checkins, range.from, range.to), [state.checkins, range]);
  const moods = useMemo(() => moodCounts(state.journalEntries, range.from, range.to), [state.journalEntries, range]);

  const anyCorrelation = energizers.length || blockers.length || link;

  return (
    <>
      <SectionLabel>What your data says</SectionLabel>
      {findings.length === 0 ? (
        <Card>
          <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
            Not enough logged yet to say anything honest. A handful more check-ins and this
            starts calling out what's actually driving your days — rather than inventing patterns
            out of three data points.
          </p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {findings.map((f, i) => (
            <Card key={i} style={{
              marginBottom: 0,
              borderColor: alpha(f.tone === "good" ? C.green : C.red, 0.25),
              background: `linear-gradient(135deg, ${alpha(f.tone === "good" ? C.green : C.red, 0.06)}, ${C.surface})`,
            }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Lightbulb size={15} color={f.tone === "good" ? C.green : C.red}
                  style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{
                    color: f.tone === "good" ? C.green : C.red, fontSize: 11,
                    letterSpacing: 0.5, textTransform: "uppercase", margin: 0, fontWeight: 600,
                  }}>{f.label}</p>
                  <p style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: "5px 0 0" }}>{f.text}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {energizers.length > 0 && (
        <>
          <SectionLabel>What lifts your days</SectionLabel>
          <Card>
            <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.55, margin: "0 0 14px" }}>
              Average balance on days each energizer showed up, against days it didn't.
            </p>
            {energizers.map((e) => <LiftRow key={e.id} item={e} good />)}
          </Card>
        </>
      )}

      {blockers.length > 0 && (
        <>
          <SectionLabel color={C.red}>What drags them down</SectionLabel>
          <Card>
            {blockers.map((b) => <LiftRow key={b.id} item={b} />)}
          </Card>
        </>
      )}

      {link && (
        <>
          <SectionLabel>Habits versus how you felt</SectionLabel>
          <Card>
            <div style={{ display: "flex", gap: 12 }}>
              <CompareTile label="Every habit done" value={link.full} n={link.nFull} color={C.green} />
              <CompareTile label="Some left undone" value={link.partial} n={link.nPartial} color={C.muted} />
            </div>
            <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: "14px 0 0" }}>
              {link.lift > 0
                ? `Finishing everything is worth about ${link.lift.toFixed(1)} points of mood. That's the payoff the plan is actually for.`
                : "No clear mood difference yet between full days and partial ones."}
            </p>
          </Card>
        </>
      )}

      {wkBalance.some((d) => d.n > 0) && (
        <>
          <SectionLabel>Your week, by feel</SectionLabel>
          <Card style={{ height: 190, padding: "16px 6px 4px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wkBalance} margin={{ top: 6, right: 12, bottom: 4, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 5]} tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  formatter={(v, _n, p) => [v ?? "no data", `${p.payload.n} check-in${p.payload.n === 1 ? "" : "s"}`]} />
                <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                  {wkBalance.map((d) => (
                    <Cell key={d.key} fill={d.value === null ? C.surface3 : d.value >= 3.5 ? C.green : d.value >= 2.5 ? C.gold : C.red} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      {moods.length > 0 && (
        <>
          <SectionLabel>How you wrote about it</SectionLabel>
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {moods.map((m) => {
                const max = moods[0].count;
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 15, width: 20 }}>{m.emoji}</span>
                    <span style={{ color: C.text, fontSize: 12.5, width: 74 }}>{m.label}</span>
                    <div style={{ flex: 1 }}>
                      <ProgressBar pct={(m.count / max) * 100} color={C.purple} height={6} />
                    </div>
                    <span style={{ color: C.muted, fontSize: 11.5, width: 20, textAlign: "right" }}>{m.count}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {!anyCorrelation && findings.length === 0 && (
        <p style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.6, marginTop: 16 }}>
          Correlations need at least three check-ins on each side of a comparison before they mean
          anything, so they appear as your history grows.
        </p>
      )}
    </>
  );
}

/* ---------------- Small pieces ---------------- */
function Metric({ label, value, sub, change, Icon }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md, padding: "12px 10px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        {Icon && <Icon size={12} color={C.gold} style={{ alignSelf: "center" }} />}
        <span style={{ color: C.text, fontSize: 19, fontFamily: F.display, fontWeight: 600 }}>{value}</span>
        {sub && <span style={{ color: C.faint, fontSize: 10 }}>{sub}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, gap: 4 }}>
        <span style={{ color: C.muted, fontSize: 9, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</span>
        <ChangeChip change={change} compact />
      </div>
    </div>
  );
}

function ChangeChip({ change, compact, suffix = "" }) {
  if (!change) return null;
  if (change.dir === "flat") {
    return <Minus size={compact ? 10 : 12} color={C.faint} />;
  }
  const up = change.dir === "up";
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 1,
      color: up ? C.green : C.red, fontSize: compact ? 9.5 : 11, fontWeight: 600,
    }}>
      <Arrow size={compact ? 10 : 12} />{Math.abs(change.diff)}{suffix}
    </span>
  );
}

function LiftRow({ item, good }) {
  const positive = item.lift > 0;
  const color = positive ? C.green : C.red;
  const width = Math.min(100, Math.abs(item.lift) * 40);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <item.Icon size={13} color={item.color} />
        <span style={{ flex: 1, color: C.text, fontSize: 12.5 }}>{item.label}</span>
        <span style={{ color, fontSize: 11.5, fontWeight: 600 }}>
          {positive ? "+" : ""}{item.lift.toFixed(1)}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, display: "flex", justifyContent: positive ? "flex-start" : "flex-end" }}>
          <div style={{ width: `${width}%`, height: 5, borderRadius: 3, background: color, opacity: 0.75 }} />
        </div>
      </div>
      <p style={{ color: C.faint, fontSize: 10.5, margin: "5px 0 0" }}>
        {item.with} with · {item.without} without · {item.n} day{item.n === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function CompareTile({ label, value, n, color }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", background: alpha(color, 0.08),
      border: `1px solid ${alpha(color, 0.25)}`, borderRadius: R.md, padding: "14px 8px",
    }}>
      <p style={{ color, fontSize: 24, fontFamily: F.display, fontWeight: 600, margin: 0 }}>{value}</p>
      <p style={{ color: C.text, fontSize: 11.5, margin: "6px 0 0", lineHeight: 1.35 }}>{label}</p>
      <p style={{ color: C.faint, fontSize: 10, margin: "3px 0 0" }}>{n} days</p>
    </div>
  );
}

const round = (n) => (n === null ? null : Math.round(n * 100) / 100);
