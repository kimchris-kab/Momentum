import React, { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { Check, Flame, Plus, Target, Trash2, TrendingUp } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { PILLARS, P_BY_ID } from "../data/constants.js";
import { addDays, parseD, prettyDate, todayStr } from "../lib/date.js";
import { dayStats, isDone, tasksForDate } from "../lib/tasks.js";
import {
  Card, Checkbox, EmptyState, Pill, ProgressBar, SegmentedControl, SectionLabel,
} from "../components/ui.jsx";

function summarize(entries) {
  const perPillar = {};
  PILLARS.forEach((p) => {
    const vals = entries.map((c) => c.scores[p.id]).filter((v) => typeof v === "number");
    if (vals.length) perPillar[p.id] = vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  const ids = Object.keys(perPillar);
  const balance = ids.length ? ids.reduce((a, id) => a + perPillar[id], 0) / ids.length : 0;
  let best = null, focus = null;
  ids.forEach((id) => {
    if (best === null || perPillar[id] > perPillar[best]) best = id;
    if (focus === null || perPillar[id] < perPillar[focus]) focus = id;
  });
  return { perPillar, balance, best, focus, deeds: entries.filter((c) => c.deed).length, entries: entries.length };
}

export default function InsightsView({ state, streak, onAddGoal, onUpdateGoal, onRemoveGoal }) {
  const { checkins, goals, tasks, dayLog } = state;
  const [span, setSpan] = useState("week");
  const [pid, setPid] = useState("overall");
  const [gpid, setGpid] = useState(PILLARS[0].id);
  const [gtext, setGtext] = useState("");

  const sorted = useMemo(() => [...checkins].sort((a, b) => a.date.localeCompare(b.date)), [checkins]);
  const days = span === "week" ? 7 : 30;

  const period = useMemo(() => {
    const cut = addDays(todayStr(), -(days - 1));
    return summarize(sorted.filter((c) => c.date >= cut));
  }, [sorted, days]);

  const trend = useMemo(() => sorted.map((c) => {
    const row = { date: prettyDate(c.date) };
    if (pid === "overall") {
      const vals = PILLARS.map((p) => c.scores[p.id]).filter((v) => typeof v === "number");
      row.value = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
    } else row.value = c.scores[pid] ?? null;
    return row;
  }), [sorted, pid]);

  // Habit consistency over the same window
  const consistency = useMemo(() => {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(todayStr(), -i);
      const s = dayStats(tasks, d, dayLog, "build");
      out.push({ date: prettyDate(d), pct: s.ratio === null ? null : Math.round(s.ratio * 100) });
    }
    return out;
  }, [tasks, dayLog, days]);

  const completedInWindow = useMemo(() => {
    let done = 0, scheduled = 0;
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(todayStr(), -i);
      const s = dayStats(tasks, d, dayLog, "build");
      done += s.done;
      scheduled += s.total;
    }
    return { done, scheduled, pct: scheduled ? Math.round((done / scheduled) * 100) : 0 };
  }, [tasks, dayLog, days]);

  // Per-habit reliability, best first
  const habitBreakdown = useMemo(() => {
    const habits = tasks.filter((t) => t.kind === "build" && t.recurrence && !t.archivedAt);
    return habits.map((h) => {
      let done = 0, scheduled = 0;
      for (let i = days - 1; i >= 0; i--) {
        const d = addDays(todayStr(), -i);
        if (!tasksForDate([h], d, "build").length) continue;
        scheduled++;
        if (isDone(h, d, dayLog)) done++;
      }
      return { id: h.id, text: h.text, done, scheduled, pct: scheduled ? Math.round((done / scheduled) * 100) : null };
    }).filter((h) => h.scheduled > 0).sort((a, b) => b.pct - a.pct);
  }, [tasks, dayLog, days]);

  const pillarBars = useMemo(() => PILLARS.map((p) => ({
    name: p.name.split("-")[0],
    value: +(period.perPillar[p.id] || 0).toFixed(2),
    color: p.color,
  })), [period]);

  const active = pid === "overall" ? { name: "Balance", color: C.gold } : P_BY_ID[pid];

  const addGoal = () => {
    if (!gtext.trim()) return;
    onAddGoal({
      id: Date.now(), pillar: gpid, text: gtext.trim(), done: false,
      notes: "", subtasks: [], starred: false,
    });
    setGtext("");
  };

  return (
    <div style={styles.page}>
      <p style={styles.eyebrow}>Look back</p>
      <h1 style={styles.h1}>Insights</h1>

      <SegmentedControl value={span} onChange={setSpan} style={{ marginBottom: 14 }}
        options={[{ id: "week", label: "This week" }, { id: "month", label: "This month" }]} />

      <Card flip style={styles.cardTall}>
        {period.entries === 0 && completedInWindow.scheduled === 0 ? (
          <EmptyState Icon={TrendingUp} title="Nothing to summarize yet"
            hint="Check in and complete a few habits — your patterns fill in here." />
        ) : (
          <>
            <div style={{ display: "flex", gap: 10 }}>
              <Tile label="Balance" value={period.balance ? period.balance.toFixed(1) : "—"} sub="/ 5" />
              <Tile label="Logged" value={period.entries} sub={`/ ${days}`} />
              <Tile label="Habits" value={`${completedInWindow.pct}%`} sub="hit" />
              <Tile label="Streak" value={streak} sub="d" />
            </div>
            {period.best && (
              <p style={{
                color: C.text, fontSize: 13.5, lineHeight: 1.65, marginTop: 16, marginBottom: 0,
                paddingTop: 14, borderTop: `1px solid ${C.border}`,
              }}>
                Your strongest area was <b style={{ color: P_BY_ID[period.best].color }}>{P_BY_ID[period.best].name}</b>.
                {period.focus && period.focus !== period.best && (
                  <> The one asking for attention is <b style={{ color: P_BY_ID[period.focus].color }}>
                    {P_BY_ID[period.focus].name}</b> — a small step there would even out your map.</>
                )}
              </p>
            )}
          </>
        )}
      </Card>

      <SectionLabel>Habit consistency</SectionLabel>
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
              interval={Math.floor(consistency.length / 6)} />
            <YAxis domain={[0, 100]} tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, "Completed"]} />
            <Area type="monotone" dataKey="pct" stroke={C.gold} strokeWidth={2} fill="url(#consfill)" connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <SectionLabel>Pillar balance</SectionLabel>
      <Card style={{ height: 200, padding: "16px 6px 4px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={pillarBars} margin={{ top: 6, right: 12, bottom: 4, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: C.faint, fontSize: 9.5 }} tickLine={false} axisLine={false}
              interval={0} angle={-28} textAnchor="end" height={46} />
            <YAxis domain={[0, 5]} tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="value" radius={[5, 5, 0, 0]}>
              {pillarBars.map((b) => <Cell key={b.name} fill={b.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <SectionLabel>Trend</SectionLabel>
      <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 12, margin: "0 -18px", padding: "0 18px 12px" }}>
        {[{ id: "overall", name: "Balance", color: C.gold }, ...PILLARS].map((p) => (
          <Pill key={p.id} on={pid === p.id} color={p.color} onClick={() => setPid(p.id)}>{p.name}</Pill>
        ))}
      </div>
      {sorted.length < 2 ? (
        <Card><EmptyState Icon={TrendingUp} title="Two check-ins and the lines start to grow" hint="Keep going." /></Card>
      ) : (
        <Card style={{ height: 240, padding: "16px 6px 4px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 6, right: 12, bottom: 4, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fill: C.faint, fontSize: 10 }}
                tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="value" stroke={active.color} strokeWidth={2.4}
                dot={{ r: 3, fill: active.color, strokeWidth: 0 }} connectNulls name={active.name} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {habitBreakdown.length > 0 && (
        <>
          <SectionLabel>Which habits are holding</SectionLabel>
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {habitBreakdown.map((h) => (
                <div key={h.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: C.text, fontSize: 12.5, flex: 1, minWidth: 0 }}>{h.text}</span>
                    <span style={{ color: h.pct >= 70 ? C.green : h.pct >= 40 ? C.gold : C.red, fontSize: 11.5, fontWeight: 600 }}>
                      {h.pct}% · {h.done}/{h.scheduled}
                    </span>
                  </div>
                  <ProgressBar pct={h.pct} color={h.pct >= 70 ? C.green : h.pct >= 40 ? C.gold : C.red} height={5} />
                </div>
              ))}
            </div>
          </Card>
        </>
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

      {goals.length === 0 ? (
        <EmptyState Icon={Target} title="No intentions set"
          hint="Name one thing you want to move on, in any pillar." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {goals.map((g) => {
            const p = P_BY_ID[g.pillar];
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
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 4, background: p.color }} />
                      <span style={{ color: C.faint, fontSize: 11 }}>{p.name}</span>
                    </div>
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
    </div>
  );
}

const tooltipStyle = {
  background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 12,
};

function Tile({ label, value, sub }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 2 }}>
        <span style={{ color: C.text, fontSize: 19, fontFamily: F.display, fontWeight: 600 }}>{value}</span>
        <span style={{ color: C.faint, fontSize: 10 }}>{sub}</span>
      </div>
      <p style={{ color: C.muted, fontSize: 9.5, marginTop: 3, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</p>
    </div>
  );
}
