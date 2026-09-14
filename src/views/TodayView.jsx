import React, { useMemo, useState } from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";
import {
  AlertTriangle, Ban, CalendarDays, Check, ChevronDown, ChevronUp, Fingerprint, Flame,
  ListChecks, PartyPopper, PenLine, RefreshCw, Sparkles, Sun,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { MANTRAS, PILLARS, P_BY_ID } from "../data/constants.js";
import { hashIdx, longDate, todayStr } from "../lib/date.js";
import { dayStats, habitStreak, isDone, tasksForDate } from "../lib/tasks.js";
import { Card, Checkbox, EmptyState, IconButton, ProgressRing, SectionLabel } from "../components/ui.jsx";
import TaskRow from "../components/TaskRow.jsx";

export default function TodayView({
  state, averages, overall, streak, breakStreak, tally, heatmap, yesterdayMissed, needsRest,
  onToggleTask, onOpenTask, onToggleStar, onCheckin, onOpenHabits, onOpenIdentity, onOpenTasks,
  onRerollMantra,
}) {
  const { tasks, dayLog, checkins, lists } = state;
  const today = todayStr();
  const [showCompleted, setShowCompleted] = useState(false);

  const hour = new Date().getHours();
  const greet = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const checkedInToday = checkins.some((c) => c.date === today);
  const count = checkins.length;

  const builds = useMemo(() => tasksForDate(tasks, today, "build"), [tasks, today]);
  const todos = useMemo(() => tasksForDate(tasks, today, "todo"), [tasks, today]);
  const avoids = useMemo(() => tasksForDate(tasks, today, "break"), [tasks, today]);

  const agenda = [...builds, ...todos];
  const agendaDone = agenda.filter((t) => isDone(t, today, dayLog));
  const agendaOpen = agenda.filter((t) => !isDone(t, today, dayLog))
    .sort((a, b) => (a.time && b.time) ? a.time.localeCompare(b.time) : a.time ? -1 : b.time ? 1 : 0);
  const pct = agenda.length ? Math.round((agendaDone.length / agenda.length) * 100) : 0;
  const fullyDone = agenda.length > 0 && pct === 100;

  const buildStats = dayStats(tasks, today, dayLog, "build");
  const avoidDone = avoids.filter((t) => isDone(t, today, dayLog)).length;

  const radarData = PILLARS.map((p) => ({ pillar: p.name.split("-")[0], value: +averages[p.id].toFixed(2) }));
  const mantra = MANTRAS[(state.mantraIdxByDate[today] ?? hashIdx(today, MANTRAS.length)) % MANTRAS.length];

  const totalVotes = Object.values(tally).reduce((a, b) => a + b, 0);
  const topPillar = Object.keys(tally).length
    ? Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0] : null;

  const weeks = [];
  for (let i = 0; i < heatmap.length; i += 7) weeks.push(heatmap.slice(i, i + 7));

  const listById = Object.fromEntries(lists.map((l) => [l.id, l]));

  const row = (t) => (
    <TaskRow
      key={t.id} task={t} date={today} done={isDone(t, today, dayLog)}
      streak={t.kind === "build" ? habitStreak(t, tasks, dayLog) : 0}
      listChip={t.kind === "todo" && t.listId !== "inbox" ? listById[t.listId] : null}
      onToggle={() => onToggleTask(t)} onOpen={() => onOpenTask(t)} onToggleStar={() => onToggleStar(t)}
    />
  );

  return (
    <div style={styles.page}>
      <p style={styles.eyebrow}>{greet}</p>
      <h1 style={styles.h1}>Today</h1>

      <Card flip style={{ ...styles.cardTall, display: "flex", alignItems: "center", gap: 16 }}>
        <ProgressRing pct={pct} size={78}>
          <span style={{ color: C.text, fontFamily: F.display, fontSize: 19, fontWeight: 600 }}>{pct}%</span>
          <span style={{ color: C.faint, fontSize: 9, letterSpacing: 0.4 }}>DONE</span>
        </ProgressRing>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: C.text, fontSize: 14.5, fontWeight: 600, margin: 0 }}>{longDate(today)}</p>
          <p style={{ color: C.muted, fontSize: 12.5, margin: "4px 0 0", lineHeight: 1.5 }}>
            {agenda.length === 0
              ? "Nothing scheduled yet — add a task or a habit."
              : `${agendaDone.length} of ${agenda.length} done · ${buildStats.total} habit${buildStats.total === 1 ? "" : "s"}`}
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.gold, fontSize: 12 }}>
              <Flame size={13} className="mtm-glow-pulse" /> {streak}d build
            </span>
            {avoids.length > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.red, fontSize: 12 }}>
                <Ban size={12} /> {breakStreak}d clean
              </span>
            )}
          </div>
        </div>
      </Card>

      {yesterdayMissed && (
        <div className="mtm-card-flip" style={warn(C.red)}>
          <AlertTriangle size={16} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={warnText}>Yesterday's habits weren't finished. <b>Never miss twice</b> — let's get today done.</p>
        </div>
      )}
      {needsRest && (
        <div className="mtm-card-flip" style={warn(C.teal)}>
          <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>🪫</span>
          <p style={warnText}>Low energy three check-ins running. <b>Sustain, don't burn out</b> — consider an easier day.</p>
        </div>
      )}

      <div style={{ ...styles.card, background: `linear-gradient(135deg, ${alpha(C.gold, 0.08)}, ${C.surface})`, borderColor: alpha(C.gold, 0.2) }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Sparkles size={16} color={C.gold} className="mtm-glow-pulse" style={{ marginTop: 3, flexShrink: 0 }} />
          <p style={{
            color: C.text, fontSize: 14, lineHeight: 1.6, fontFamily: F.display,
            fontStyle: "italic", margin: 0,
          }}>{mantra}</p>
        </div>
        <button onClick={onRerollMantra} style={{ ...styles.linkBtn, color: C.gold, marginTop: 10 }}>
          <RefreshCw size={12} /> New mantra
        </button>
      </div>

      <button onClick={onCheckin} style={{ ...styles.cta, opacity: checkedInToday ? 0.85 : 1, marginBottom: 6 }}>
        {checkedInToday ? <Check size={18} /> : <PenLine size={17} />}
        {checkedInToday ? "Edit today's check-in" : "Check in for today"}
      </button>

      {/* Agenda */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "26px 0 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ListChecks size={16} color={C.gold} />
          <span style={{ color: C.text, fontSize: 14.5, fontWeight: 650 }}>Your plan</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <IconButton onClick={onOpenIdentity} title="Identity"><Fingerprint size={15} /></IconButton>
          <IconButton onClick={onOpenHabits} title="Habits"><CalendarDays size={15} /></IconButton>
          <IconButton onClick={onOpenTasks} title="All tasks"><ListChecks size={15} /></IconButton>
        </div>
      </div>

      <Card>
        {fullyDone && (
          <div style={{
            display: "flex", alignItems: "center", gap: 7, color: C.gold, fontSize: 12.5, fontWeight: 600,
            marginBottom: 12, background: C.goldSoft, padding: "9px 12px", borderRadius: R.sm,
          }}>
            <PartyPopper size={15} /> Full day complete — nice work.
          </div>
        )}

        {agenda.length === 0 ? (
          <EmptyState
            Icon={Sun}
            title="Nothing scheduled today"
            hint="Add a task with the + button, or set up habits that repeat on the days you choose."
          />
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {agendaOpen.map(row)}
            </div>
            {agendaDone.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <button onClick={() => setShowCompleted((s) => !s)} style={styles.linkBtn}>
                  {showCompleted ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  Completed ({agendaDone.length})
                </button>
                {showCompleted && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                    {agendaDone.map(row)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      {avoids.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "22px 0 10px" }}>
            <Ban size={15} color={C.red} />
            <span style={{ color: C.text, fontSize: 14.5, fontWeight: 650 }}>Staying away from</span>
            <span style={{ ...styles.tag, color: C.red, background: alpha(C.red, 0.13) }}>
              {avoidDone}/{avoids.length}
            </span>
          </div>
          <Card style={{ borderColor: alpha(C.red, 0.18) }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {avoids.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 2px" }}>
                  <Checkbox checked={isDone(t, today, dayLog)} onClick={() => onToggleTask(t)} color={C.red} />
                  <button onClick={() => onOpenTask(t)} style={{
                    flex: 1, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", minWidth: 0,
                  }}>
                    <span style={{
                      display: "block", color: isDone(t, today, dayLog) ? C.faint : C.text, fontSize: 13.5,
                      textDecoration: isDone(t, today, dayLog) ? "line-through" : "none",
                    }}>{t.text}</span>
                    {t.trigger && (
                      <span style={{ display: "block", color: C.faint, fontSize: 11, marginTop: 2 }}>
                        Trigger: {t.trigger}
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Map */}
      <SectionLabel>Your map</SectionLabel>
      <Card style={styles.cardTall}>
        {count === 0 ? (
          <EmptyState
            Icon={Sparkles}
            title="Your map is empty"
            hint="Do your first check-in and each pillar starts to take shape."
          />
        ) : (
          <div style={{ height: 250, margin: "0 -6px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="70%">
                <defs>
                  <radialGradient id="mapfill" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={C.gold} stopOpacity={0.42} />
                    <stop offset="100%" stopColor={C.gold} stopOpacity={0.08} />
                  </radialGradient>
                </defs>
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis dataKey="pillar" tick={{ fill: C.muted, fontSize: 10.5 }} />
                <Radar dataKey="value" stroke={C.gold} strokeWidth={2} fill="url(#mapfill)"
                  dot={{ r: 3, fill: C.gold, strokeWidth: 0 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div style={{
          display: "flex", alignItems: "center", marginTop: 6, paddingTop: 14,
          borderTop: `1px solid ${C.border}`,
        }}>
          <Stat label="Balance" value={count ? overall.toFixed(1) : "—"} sub="/ 5" delay={0} />
          <div style={{ width: 1, height: 30, background: C.border }} />
          <Stat label="Streak" value={streak} sub={streak === 1 ? "day" : "days"} flame delay={0.1} />
          <div style={{ width: 1, height: 30, background: C.border }} />
          <Stat label="Entries" value={count} sub={count === 1 ? "log" : "logs"} delay={0.2} />
        </div>
      </Card>

      {totalVotes > 0 && (
        <button onClick={onOpenIdentity} className="mtm-card-flip" style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10, background: C.surface,
          border: `1px solid ${C.border}`, borderRadius: R.md, padding: "13px 14px",
          marginBottom: 12, cursor: "pointer", textAlign: "left",
        }}>
          <Fingerprint size={16} color={C.gold} />
          <span style={{ color: C.text, fontSize: 12.5 }}>
            <b>{totalVotes}</b> vote{totalVotes === 1 ? "" : "s"} cast for who you're becoming
            {topPillar && <> · strongest in <b style={{ color: P_BY_ID[topPillar].color }}>{P_BY_ID[topPillar].name}</b></>}
          </span>
        </button>
      )}

      <SectionLabel>Don't break the chain</SectionLabel>
      <Card>
        <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 2 }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {week.map((day) => (
                <div key={day.date}
                  title={`${day.date}${day.ratio !== null ? ` · ${Math.round(day.ratio * 100)}%` : ""}`}
                  style={{
                    width: 10, height: 10, borderRadius: 3,
                    background: day.ratio === null ? C.surface2 : C.gold,
                    opacity: day.ratio === null ? 1 : 0.15 + day.ratio * 0.85,
                    border: day.ratio === null ? `1px solid ${C.border}` : "none",
                  }} />
              ))}
            </div>
          ))}
        </div>
        <p style={{ color: C.faint, fontSize: 10.5, marginTop: 10, marginBottom: 0 }}>
          Last 12 weeks of habit completion
        </p>
      </Card>
    </div>
  );
}

const warn = (color) => ({
  display: "flex", gap: 9, background: alpha(color, 0.08), border: `1px solid ${alpha(color, 0.25)}`,
  borderRadius: R.md, padding: "12px 14px", marginBottom: 12,
});
const warnText = { color: C.text, fontSize: 12.5, lineHeight: 1.5, margin: 0 };

function Stat({ label, value, sub, flame, delay }) {
  return (
    <div className="mtm-card-flip" style={{ flex: 1, textAlign: "center", animationDelay: `${delay}s` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 3 }}>
        {flame && value > 0 && <Flame size={14} color={C.gold} className="mtm-glow-pulse" style={{ alignSelf: "center" }} />}
        <span style={{ color: C.text, fontSize: 21, fontFamily: F.display, fontWeight: 600 }}>{value}</span>
        <span style={{ color: C.faint, fontSize: 11 }}>{sub}</span>
      </div>
      <p style={{ color: C.muted, fontSize: 10, marginTop: 3, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</p>
    </div>
  );
}
