import React, { Suspense, lazy, useMemo, useState } from "react";
import {
  Ban, CalendarCheck, CalendarDays, CalendarRange, Check, ChevronDown, ChevronRight, ChevronUp,
  Clock4, Crosshair, Fingerprint, Flame, ListChecks, PartyPopper, PenLine, RefreshCw, Snowflake,
  Search, Settings, Sparkles, Sun, Target,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { MANTRAS, PILLARS, pillarOf } from "../data/constants.js";
import { hashIdx, longDate, todayStr } from "../lib/date.js";
import { agendaForDate, dayStats, isDone, isFlexible, tasksForDate, weekProgress } from "../lib/tasks.js";
import {
  freezesLeft, habitStreakProtected, isFrozen, missedYesterday, nextMilestone, reviewDue,
} from "../lib/habits.js";
import {
  MAX_FOCUS, daysLate, focusFor, overdueTasks, planDue, planFor, weekStart,
} from "../lib/planning.js";
import { Card, Checkbox, EmptyState, IconButton, ProgressRing, SectionLabel } from "../components/ui.jsx";
import TaskRow from "../components/TaskRow.jsx";
import RecoveryCard from "../components/RecoveryCard.jsx";
import { SrbaiPrompt } from "../components/SrbaiSheet.jsx";
import {
  ComebackCard, FreshStartCard, StartSmallCard, WoopPrompt,
} from "../components/WoopSheet.jsx";
import { OnboardingPrompt } from "./OnboardingView.jsx";
import DayTimeline from "../components/DayTimeline.jsx";
import ChunkBoundary from "../components/ChunkBoundary.jsx";
import {
  AutomaticityCard, CueHealthCard, FocusTodayCard, WeekPulseCard,
} from "../components/TodayCards.jsx";

// recharts is about half the bundle and the only thing on this view that needs it, so it
// loads after the page does rather than blocking the first thing anyone sees.
const PillarRadar = lazy(() => import("../components/PillarRadar.jsx"));
const ChartPlaceholder = () => (
  <div style={{
    height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
    color: C.faint, fontSize: 11.5,
  }}>
    Drawing your map…
  </div>
);

export default function TodayView({
  state, averages, overall, streak, breakStreak, tally, heatmap, needsRest,
  onToggleTask, onOpenTask, onToggleStar, onCheckin, onOpenHabits, onOpenIdentity, onOpenTasks,
  onRerollMantra, onFreeze, onRepair, onStartRitual, onOpenReview, onOpenPlan,
  onRescheduleOverdue, onToggleFocus, onStartFocus, onSchedule, srbaiDue = [], onRateHabit,
  onOpenSettings, onOpenSearch, freshStart: fresh, onAcceptFreshStart, onDismissFreshStart,
  comebacks = [], onAckComebacks, startSmall, woopNeeded = [], onStartWoop,
  onboarding, onStartOnboarding, onDismissOnboarding,
}) {
  const { tasks, dayLog, checkins, lists, freezes, reviews, dayFocus, weekPlans } = state;
  const today = todayStr();
  const [showCompleted, setShowCompleted] = useState(false);


  const hour = new Date().getHours();
  const greet = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const checkedInToday = checkins.some((c) => c.date === today);
  const count = checkins.length;

  // agendaForDate, not tasksForDate: a quota habit that has already hit its week stops
  // asking for a tap instead of sitting in the list looking undone.
  const builds = useMemo(() => agendaForDate(tasks, today, dayLog, "build"), [tasks, today, dayLog]);
  const todos = useMemo(() => tasksForDate(tasks, today, "todo"), [tasks, today]);
  const avoids = useMemo(() => agendaForDate(tasks, today, dayLog, "break"), [tasks, today, dayLog]);
  const overdue = useMemo(() => overdueTasks(tasks, today), [tasks, today]);

  const agenda = [...builds, ...todos];
  const focusIds = focusFor(dayFocus, today);
  const focus = agenda.filter((t) => focusIds.includes(t.id));
  const focusDone = focus.filter((t) => isDone(t, today, dayLog)).length;
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
  const topPillarId = Object.keys(tally).length
    ? Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0] : null;
  // The tally is keyed by whatever pillar ids the saved tasks carry, and a migrated v1 save
  // or a restored backup can hold one this build no longer has.
  const topPillar = pillarOf(topPillarId);

  const weeks = [];
  for (let i = 0; i < heatmap.length; i += 7) weeks.push(heatmap.slice(i, i + 7));

  const listById = Object.fromEntries(lists.map((l) => [l.id, l]));
  const missed = useMemo(() => missedYesterday(tasks, dayLog, freezes), [tasks, dayLog, freezes]);
  const showReview = reviewDue(reviews) && tasks.some((t) => t.kind === "build" && t.recurrence);
  const weekPriorities = planFor(weekPlans, weekStart(today)).priorities || [];
  const showPlanPrompt = planDue(weekPlans) && weekPriorities.length === 0;

  // A habit with a two-minute version or a timer earns the start ritual; anything simpler
  // stays a single tap, so "take vitamins" never gets ceremony it doesn't need.
  const wantsRitual = (t) => t.kind === "build" && (t.twoMin || t.timerMinutes);

  const row = (t) => (
    <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <TaskRow
          task={t} date={today} done={isDone(t, today, dayLog)}
          streak={t.kind === "build" ? habitStreakProtected(t, dayLog, freezes) : 0}
          listChip={t.kind === "todo" && t.listId !== "inbox" ? listById[t.listId] : null}
          week={isFlexible(t) ? weekProgress(t, dayLog, today) : null}
          onToggle={() => onToggleTask(t)}
          onOpen={() => (wantsRitual(t) ? onStartRitual(t) : onOpenTask(t))}
          onToggleStar={() => onToggleStar(t)}
          onFocus={onStartFocus ? () => onStartFocus(t) : null}
        />
      </div>
      <button onClick={() => onToggleFocus(t.id)} title={focusIds.includes(t.id) ? "Remove from focus" : "Make this a focus"}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: "10px 2px 2px",
          color: focusIds.includes(t.id) ? C.gold : C.faint, flexShrink: 0,
        }}>
        <Crosshair size={13} />
      </button>
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div>
          <p style={styles.eyebrow}>{greet}</p>
          <h1 style={styles.h1}>Today</h1>
        </div>
        <div style={{ paddingBottom: 18, display: "flex", gap: 8 }}>
          {onOpenSearch && (
            <IconButton onClick={onOpenSearch} title="Search"><Search size={15} /></IconButton>
          )}
          {onOpenSettings && (
            <IconButton onClick={onOpenSettings} title="Settings"><Settings size={15} /></IconButton>
          )}
        </div>
      </div>

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
          <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.gold, fontSize: 12 }}>
              <Flame size={13} className="mtm-glow-pulse" /> {streak}d build
            </span>
            {avoids.length > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.red, fontSize: 12 }}>
                <Ban size={12} /> {breakStreak}d clean
              </span>
            )}
            {isFrozen(freezes, today) && (
              <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.teal, fontSize: 12 }}>
                <Snowflake size={12} /> frozen
              </span>
            )}
          </div>
          {focus.length > 0 ? (
            <p style={{ color: C.muted, fontSize: 11.5, margin: "8px 0 0", lineHeight: 1.5 }}>
              <Crosshair size={11} color={C.gold} style={{ verticalAlign: -1, marginRight: 4 }} />
              Focus: <b style={{ color: focusDone === focus.length ? C.green : C.text }}>
                {focusDone}/{focus.length}
              </b>{" "}
              — {focus.filter((t) => !isDone(t, today, dayLog)).map((t) => t.text).join(", ") || "all done"}
            </p>
          ) : nextMilestone(streak) && streak > 0 ? (
            <p style={{ color: C.faint, fontSize: 11, margin: "8px 0 0" }}>
              {nextMilestone(streak) - streak} day{nextMilestone(streak) - streak === 1 ? "" : "s"} to your{" "}
              {nextMilestone(streak)}-day milestone
            </p>
          ) : null}
        </div>
      </Card>

      {comebacks.length > 0 && (
        <ComebackCard comebacks={comebacks} onDismiss={() => onAckComebacks(comebacks)} />
      )}

      {fresh && (
        <FreshStartCard
          prompt={fresh}
          onAccept={() => { onAcceptFreshStart(fresh); onOpenHabits(); }}
          onDismiss={() => onDismissFreshStart(fresh)}
        />
      )}

      {onboarding && !onboarding.complete && !onboarding.dismissed && onStartOnboarding && (
        <OnboardingPrompt onStart={onStartOnboarding} onDismiss={onDismissOnboarding} />
      )}

      {woopNeeded.length > 0 && onStartWoop && (
        <WoopPrompt goals={woopNeeded} onStart={onStartWoop} />
      )}

      {srbaiDue.length > 0 && onRateHabit && (
        <SrbaiPrompt tasks={srbaiDue} onRate={onRateHabit} />
      )}

      <RecoveryCard
        missed={missed} freezes={freezes} streak={streak}
        onFreeze={onFreeze} onRepair={onRepair} onStartMinimal={onStartRitual}
      />

      {overdue.length > 0 && (
        <div className="mtm-card-flip" style={{
          background: `linear-gradient(135deg, ${alpha(C.orange, 0.11)}, ${C.surface})`,
          border: `1px solid ${alpha(C.orange, 0.3)}`, borderRadius: R.lg, padding: 16, marginBottom: 12,
        }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Clock4 size={17} color={C.orange} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: C.text, fontSize: 14.5, fontWeight: 650, margin: 0, fontFamily: F.display }}>
                {overdue.length} still owed
              </p>
              <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: "4px 0 0" }}>
                Dated before today and never finished. They don't disappear just because the date did.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12 }}>
            {overdue.slice(0, 4).map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
                <Checkbox checked={false} onClick={() => onToggleTask(t, t.dueDate)} color={C.orange} size={20} />
                <button onClick={() => onOpenTask(t)} style={{
                  flex: 1, minWidth: 0, background: "none", border: "none", padding: 0,
                  cursor: "pointer", textAlign: "left",
                }}>
                  <span style={{ display: "block", color: C.text, fontSize: 13.5 }}>{t.text}</span>
                </button>
                <span style={{ ...styles.tag, color: C.orange, background: alpha(C.orange, 0.14) }}>
                  {daysLate(t)}d late
                </span>
              </div>
            ))}
            {overdue.length > 4 && (
              <p style={{ color: C.faint, fontSize: 11, margin: "6px 0 0" }}>
                and {overdue.length - 4} more
              </p>
            )}
          </div>

          <button onClick={onRescheduleOverdue} style={{
            ...styles.ghostCta, height: 42, marginTop: 12, fontSize: 13,
            borderColor: alpha(C.orange, 0.45), color: C.orange,
          }}>
            <CalendarDays size={14} /> Pull all {overdue.length} into today
          </button>
        </div>
      )}

      {weekPriorities.length > 0 && (
        <button onClick={onOpenPlan} className="mtm-card-flip" style={{
          width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 12,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, padding: "14px 15px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Target size={14} color={C.gold} />
            <span style={{ color: C.muted, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", fontWeight: 600 }}>
              This week
            </span>
            <span style={{ ...styles.tag, marginLeft: "auto" }}>
              {weekPriorities.filter((p) => p.done).length}/{weekPriorities.length}
            </span>
          </div>
          {weekPriorities.map((p, i) => (
            <p key={p.id} style={{
              color: p.done ? C.faint : C.text, fontSize: 13, lineHeight: 1.5, margin: i ? "6px 0 0" : 0,
              textDecoration: p.done ? "line-through" : "none",
            }}>
              <b style={{ color: C.gold, marginRight: 6 }}>{i + 1}</b>{p.text}
            </p>
          ))}
        </button>
      )}

      {showPlanPrompt && (
        <button onClick={onOpenPlan} className="mtm-card-flip" style={{
          width: "100%", display: "flex", alignItems: "center", gap: 11, cursor: "pointer",
          background: `linear-gradient(135deg, ${alpha(C.gold, 0.1)}, ${C.surface})`,
          border: `1px solid ${alpha(C.gold, 0.28)}`, borderRadius: R.lg,
          padding: "14px 15px", marginBottom: 12, textAlign: "left",
        }}>
          <CalendarRange size={17} color={C.gold} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>Plan the week</p>
            <p style={{ color: C.muted, fontSize: 12, margin: "3px 0 0", lineHeight: 1.45 }}>
              Three things that would make it a win, before it fills up on its own.
            </p>
          </div>
          <ChevronRight size={16} color={C.faint} />
        </button>
      )}

      {showReview && (
        <button onClick={onOpenReview} className="mtm-card-flip" style={{
          width: "100%", display: "flex", alignItems: "center", gap: 11, cursor: "pointer",
          background: `linear-gradient(135deg, ${alpha(C.teal, 0.1)}, ${C.surface})`,
          border: `1px solid ${alpha(C.teal, 0.28)}`, borderRadius: R.lg,
          padding: "14px 15px", marginBottom: 12, textAlign: "left",
        }}>
          <CalendarCheck size={17} color={C.teal} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>Weekly review is due</p>
            <p style={{ color: C.muted, fontSize: 12, margin: "3px 0 0", lineHeight: 1.45 }}>
              Five minutes to see what's slipping and shrink it before it breaks.
            </p>
          </div>
          <ChevronRight size={16} color={C.faint} />
        </button>
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
          <IconButton onClick={onOpenPlan} title="Plan"><Target size={15} /></IconButton>
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

      <DayTimeline
        tasks={agenda} date={today} dayLog={dayLog}
        onSchedule={onSchedule} onOpenTask={onOpenTask}
        onFocus={onStartFocus}
      />

      <FocusTodayCard state={state} agenda={agendaOpen} onStartFocus={onStartFocus} />
      <AutomaticityCard state={state} onOpenHabits={onOpenHabits} />
      <CueHealthCard state={state} onOpenTask={onOpenTask} />
      <WeekPulseCard state={state} heatmap={heatmap} />
      <StartSmallCard check={startSmall} onOpenHabits={onOpenHabits} />

      {/* Map */}
      <SectionLabel>Your map</SectionLabel>
      <Card style={styles.cardTall}>
        {/* The chart arrives a moment after the rest of the page, so its box is held open at
            the final height — nothing below it jumps when it lands. */}
        {count === 0 ? (
          <EmptyState
            Icon={Sparkles}
            title="Your map is empty"
            hint="Do your first check-in and each pillar starts to take shape."
          />
        ) : (
          <div style={{ height: 250, margin: "0 -6px" }}>
            {/* A chart that fails to arrive shouldn't take the day's plan down with it. */}
            <ChunkBoundary resetKey="radar">
              <Suspense fallback={<ChartPlaceholder />}>
                <PillarRadar data={radarData} />
              </Suspense>
            </ChunkBoundary>
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
            {topPillar && <> · strongest in <b style={{ color: topPillar.color }}>{topPillar.name}</b></>}
          </span>
        </button>
      )}

      <SectionLabel>Don't break the chain</SectionLabel>
      <Card>
        <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 2 }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {week.map((day) => {
                const frozen = isFrozen(freezes, day.date);
                return (
                  <div key={day.date}
                    title={`${day.date}${frozen ? " · frozen" : day.ratio !== null ? ` · ${Math.round(day.ratio * 100)}%` : ""}`}
                    style={{
                      width: 10, height: 10, borderRadius: 3,
                      background: frozen ? C.teal : day.ratio === null ? C.surface2 : C.gold,
                      opacity: frozen ? 0.75 : day.ratio === null ? 1 : 0.15 + day.ratio * 0.85,
                      border: !frozen && day.ratio === null ? `1px solid ${C.border}` : "none",
                    }} />
                );
              })}
            </div>
          ))}
        </div>
        <p style={{ color: C.faint, fontSize: 10.5, marginTop: 10, marginBottom: 0 }}>
          Last 12 weeks · <span style={{ color: C.teal }}>teal</span> days were frozen, not missed
          {freezesLeft(freezes) < 2 && ` · ${freezesLeft(freezes)} freeze${freezesLeft(freezes) === 1 ? "" : "s"} left this month`}
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
