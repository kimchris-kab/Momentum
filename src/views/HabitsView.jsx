import React, { useEffect, useMemo, useState } from "react";
import {
  Ban, Bell, BellOff, ChevronDown, ChevronUp, Copy, Flame, MoreHorizontal, Pause, Pencil,
  Play, Plus, Repeat, Sparkles, Sprout, Timer, Trash2, Zap,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import {
  BREAK_TEMPLATES, DAY_PRESETS, HABIT_TEMPLATES, PILLARS, PRIORITY, P_BY_ID, WEEKDAYS,
} from "../data/constants.js";
import { formatTime12, todayStr } from "../lib/date.js";
import { describeRecurrence, isDone, occursOn, weeklyRule } from "../lib/tasks.js";
import { habitStreakProtected, nextMilestone, rewardProgress } from "../lib/habits.js";
import {
  notificationPermission, reminderCapability, requestNotificationPermission, scheduleReminders,
  sendTestReminder,
} from "../lib/notify.js";
import {
  Card, EmptyState, IconButton, Pill, SegmentedControl, SectionLabel, Sheet,
} from "../components/ui.jsx";

const sameDays = (a, b) => a.length === b.length && a.every((d) => b.includes(d));
const presetFor = (days) => DAY_PRESETS.find((p) => sameDays(p.days, days))?.id || "custom";

export default function HabitsView({
  state, onAdd, onOpenTask, onBack, onSetSetting, onDuplicate, onArchive, onDelete, onMove,
}) {
  const { tasks, dayLog, settings, freezes } = state;
  const [kind, setKind] = useState("build");
  const [perm, setPerm] = useState("default");
  const [menuFor, setMenuFor] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const capability = useMemo(() => reminderCapability(), []);

  // composer
  const [text, setText] = useState("");
  const [days, setDays] = useState(DAY_PRESETS[0].days);
  const [time, setTime] = useState("");
  const [prio, setPrio] = useState("high");
  const [pillarId, setPillarId] = useState(null);
  const [twoMin, setTwoMin] = useState("");
  const [trigger, setTrigger] = useState("");
  const [more, setMore] = useState(false);

  useEffect(() => { notificationPermission().then(setPerm); }, []);

  const enableReminders = async () => {
    const result = await requestNotificationPermission();
    setPerm(result);
    if (result === "granted") {
      onSetSetting("reminders", true);
      await scheduleReminders(tasks, { enabled: true });
      await sendTestReminder("Reminders are on", "This is what a habit nudge will look like.");
    }
  };

  const active = useMemo(
    () => tasks.filter((t) => t.kind === kind && t.recurrence && !t.archivedAt)
      .sort((a, b) => a.order - b.order),
    [tasks, kind]);
  const archived = useMemo(
    () => tasks.filter((t) => t.kind === kind && t.recurrence && t.archivedAt),
    [tasks, kind]);

  const accent = kind === "break" ? C.red : C.gold;
  const templates = kind === "break" ? BREAK_TEMPLATES : HABIT_TEMPLATES;
  const preset = presetFor(days);

  const resetComposer = () => {
    setText(""); setTime(""); setTwoMin(""); setTrigger(""); setPillarId(null); setMore(false);
    setDays(DAY_PRESETS[0].days);
  };

  const build = (over = {}) => ({
    text: (over.text ?? text).trim(),
    kind,
    priority: over.priority ?? prio,
    time: over.time ?? (time || null),
    pillarId: over.pillarId ?? pillarId,
    twoMin: (over.twoMin ?? twoMin) || null,
    trigger: (over.trigger ?? trigger) || null,
    timerMinutes: over.timerMinutes ?? null,
    recurrence: weeklyRule([...(over.days ?? days)]),
    startDate: todayStr(),
  });

  const add = (andEdit) => {
    if (!text.trim() || days.length === 0) return;
    const created = onAdd(build());
    resetComposer();
    if (andEdit && created) onOpenTask(created);
  };

  const addTemplate = (tpl) => {
    const created = onAdd(build({
      text: tpl.text,
      days: DAY_PRESETS.find((p) => p.id === tpl.preset)?.days || days,
      pillarId: tpl.pillarId ?? null,
      twoMin: tpl.twoMin ?? "",
      trigger: tpl.trigger ?? "",
      time: tpl.time ?? null,
      timerMinutes: tpl.timerMinutes ?? null,
      priority: "high",
    }));
    setShowTemplates(false);
    return created;
  };

  const menuTask = menuFor ? tasks.find((t) => t.id === menuFor) : null;
  const activeIds = active.map((t) => t.id);
  const menuIdx = menuTask ? activeIds.indexOf(menuTask.id) : -1;

  return (
    <div style={styles.page}>
      <button onClick={onBack} style={styles.back}>Back</button>
      <h1 style={styles.h1}>Habits</h1>
      <p style={styles.lede}>
        Habits repeat on the days you pick and show up in your plan automatically. Building one
        feeds your streak; avoiding one keeps your clean days running.
      </p>

      {kind === "build" && capability.level !== "none" && (
        <Card style={{
          borderColor: perm === "granted" ? alpha(C.green, 0.28) : alpha(C.gold, 0.3),
          background: perm === "granted"
            ? `linear-gradient(135deg, ${alpha(C.green, 0.07)}, ${C.surface})`
            : `linear-gradient(135deg, ${alpha(C.gold, 0.08)}, ${C.surface})`,
        }}>
          <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            {perm === "granted"
              ? <Bell size={16} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} />
              : <BellOff size={16} color={C.gold} style={{ flexShrink: 0, marginTop: 2 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>
                {perm === "granted" ? "Reminders are on" : "Get nudged at the right moment"}
              </p>
              <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, margin: "4px 0 0" }}>
                {perm === "granted" ? capability.label
                  : "A habit with a time set will nudge you when it's due. This is the single biggest lever on whether it gets done."}
              </p>
            </div>
          </div>
          {perm === "granted" ? (
            <button onClick={() => onSetSetting("reminders", settings.reminders === false)} style={{
              ...styles.linkBtn, marginTop: 12, color: settings.reminders === false ? C.gold : C.muted,
            }}>
              {settings.reminders === false ? <Bell size={12} /> : <BellOff size={12} />}
              {settings.reminders === false ? "Turn reminders back on" : "Mute all reminders"}
            </button>
          ) : (
            <button onClick={enableReminders} style={{ ...styles.cta, height: 44, marginTop: 12, fontSize: 13.5 }}>
              <Bell size={15} /> {perm === "denied" ? "Reminders blocked — enable in settings" : "Turn on reminders"}
            </button>
          )}
        </Card>
      )}

      <SegmentedControl
        value={kind}
        onChange={(k) => { setKind(k); resetComposer(); }}
        options={[{ id: "build", label: "Building" }, { id: "break", label: "Avoiding" }]}
        style={{ marginBottom: 16 }}
      />

      {/* ---- Composer ---- */}
      <Card>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add(false)}
            placeholder={kind === "build" ? "e.g. Morning prayer, gym, read" : "e.g. Doomscrolling, late-night snacking"}
            style={{ ...styles.input, flex: 1, fontSize: 13.5 }} />
          <button onClick={() => add(false)} style={{ ...styles.addBtn, background: accent }}>
            <Plus size={18} />
          </button>
        </div>

        <button onClick={() => setShowTemplates(true)} style={{ ...styles.linkBtn, marginTop: 10, color: accent }}>
          <Sparkles size={12} /> Start from a template
        </button>

        <p style={{ color: C.muted, fontSize: 10.5, margin: "14px 0 6px", letterSpacing: 0.4, textTransform: "uppercase" }}>
          Repeats on
        </p>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8 }}>
          {DAY_PRESETS.map((p) => (
            <Pill key={p.id} on={preset === p.id} color={accent} onClick={() => setDays([...p.days])}>
              {p.label}
            </Pill>
          ))}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {WEEKDAYS.map((d) => {
            const on = days.includes(d.key);
            return (
              <button key={d.key}
                onClick={() => setDays((cur) => cur.includes(d.key) ? cur.filter((x) => x !== d.key) : [...cur, d.key])}
                style={{
                  flex: 1, height: 34, borderRadius: 10, cursor: "pointer", fontSize: 11.5, fontWeight: 600,
                  fontFamily: F.body,
                  border: `1px solid ${on ? accent : C.border}`,
                  background: on ? alpha(accent, 0.14) : "transparent",
                  color: on ? accent : C.muted,
                }}>{d.letter}</button>
            );
          })}
        </div>
        {days.length === 0 && (
          <p style={{ color: C.red, fontSize: 11, margin: "8px 0 0" }}>Pick at least one day.</p>
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          <div style={styles.fieldShell}>
            <Repeat size={13} color={C.muted} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={styles.bareInput} />
          </div>
          {Object.entries(PRIORITY).map(([k, v]) => (
            <Pill key={k} on={prio === k} color={v.color} onClick={() => setPrio(k)}>{v.label}</Pill>
          ))}
        </div>

        <button onClick={() => setMore((m) => !m)} style={{ ...styles.linkBtn, marginTop: 12 }}>
          {more ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {kind === "build" ? "Identity and two-minute version" : "What triggers it"}
        </button>

        {more && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {kind === "build" && (
              <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {PILLARS.map((p) => (
                    <Pill key={p.id} on={pillarId === p.id} color={p.color}
                      onClick={() => setPillarId(pillarId === p.id ? null : p.id)}>
                      <p.Icon size={11} style={{ verticalAlign: -2, marginRight: 4 }} />{p.name}
                    </Pill>
                  ))}
                </div>
                <div style={styles.fieldShell}>
                  <Zap size={13} color={C.muted} />
                  <input value={twoMin} onChange={(e) => setTwoMin(e.target.value)}
                    placeholder="Two-minute version for hard days"
                    style={{ ...styles.bareInput, flex: 1 }} />
                </div>
              </>
            )}
            {kind === "break" && (
              <div style={styles.fieldShell}>
                <Zap size={13} color={C.red} />
                <input value={trigger} onChange={(e) => setTrigger(e.target.value)}
                  placeholder="What usually sets it off?" style={{ ...styles.bareInput, flex: 1 }} />
              </div>
            )}
          </div>
        )}

        {text.trim() && (
          <button onClick={() => add(true)} style={{ ...styles.ghostCta, height: 42, marginTop: 12, fontSize: 13 }}>
            <Pencil size={14} /> Create and open full editor
          </button>
        )}
      </Card>

      {/* ---- Active habits ---- */}
      <SectionLabel>{kind === "build" ? "Building" : "Avoiding"} · {active.length}</SectionLabel>

      {active.length === 0 ? (
        <EmptyState
          Icon={kind === "build" ? Sprout : Ban}
          title={kind === "build" ? "No habits yet" : "Nothing on the avoid list"}
          hint={kind === "build"
            ? "Add one above, or start from a template — they come with a two-minute version already written."
            : "Name what you're cutting out and check it off each day you stay clean."}
          action={
            <button onClick={() => setShowTemplates(true)} style={{ ...styles.ghostCta, width: "auto", padding: "0 20px" }}>
              <Sparkles size={15} /> Browse templates
            </button>
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {active.map((t) => (
            <HabitCard key={t.id} task={t} kind={kind} accent={accent} dayLog={dayLog} freezes={freezes}
              onOpen={() => onOpenTask(t)} onMenu={() => setMenuFor(t.id)} />
          ))}
        </div>
      )}

      {/* ---- Paused ---- */}
      {archived.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <button onClick={() => setShowArchived((s) => !s)} style={styles.linkBtn}>
            {showArchived ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Paused ({archived.length})
          </button>
          {showArchived && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              {archived.map((t) => (
                <Card key={t.id} style={{ marginBottom: 0, opacity: 0.75 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>{t.text}</p>
                      <p style={{ color: C.faint, fontSize: 11, margin: "3px 0 0" }}>
                        {describeRecurrence(t.recurrence)} · history kept
                      </p>
                    </div>
                    <button onClick={() => onArchive(t.id, false)} style={{
                      ...styles.ghostCta, width: "auto", height: 36, padding: "0 14px", fontSize: 12.5,
                      borderColor: alpha(accent, 0.4), color: accent,
                    }}>
                      <Play size={13} /> Resume
                    </button>
                    <button onClick={() => onDelete(t.id)} style={{
                      background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 4,
                    }}><Trash2 size={15} /></button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- Templates ---- */}
      <Sheet open={showTemplates} onClose={() => setShowTemplates(false)}
        title={kind === "build" ? "Starter habits" : "Common ones to cut"}>
        <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.6, margin: "0 0 14px" }}>
          {kind === "build"
            ? "Each one arrives with a schedule, a pillar and a two-minute version already filled in. Tweak it after."
            : "Each one comes with the trigger that usually sets it off — the cue you'll want out of sight."}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map((tpl) => {
            const p = tpl.pillarId ? P_BY_ID[tpl.pillarId] : null;
            const exists = tasks.some((t) => t.kind === kind && t.text.toLowerCase() === tpl.text.toLowerCase());
            return (
              <button key={tpl.text} disabled={exists} onClick={() => addTemplate(tpl)} style={{
                width: "100%", textAlign: "left", cursor: exists ? "default" : "pointer",
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md,
                padding: "13px 14px", opacity: exists ? 0.45 : 1,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  {p && <p.Icon size={14} color={p.color} style={{ flexShrink: 0 }} />}
                  <span style={{ flex: 1, color: C.text, fontSize: 14, fontWeight: 550 }}>{tpl.text}</span>
                  {exists
                    ? <span style={styles.tag}>Added</span>
                    : <Plus size={15} color={accent} />}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                  <span style={styles.tag}>
                    {DAY_PRESETS.find((d) => d.id === tpl.preset)?.label || "Every day"}
                  </span>
                  {tpl.time && <span style={styles.tag}>{formatTime12(tpl.time)}</span>}
                  {tpl.twoMin && <span style={styles.tag}><Zap size={9} /> {tpl.twoMin}</span>}
                  {tpl.trigger && <span style={{ ...styles.tag, color: C.red, background: alpha(C.red, 0.12) }}>
                    {tpl.trigger}
                  </span>}
                </div>
              </button>
            );
          })}
        </div>
      </Sheet>

      {/* ---- Per-habit actions ---- */}
      <Sheet open={!!menuTask} onClose={() => setMenuFor(null)} title={menuTask?.text}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Action Icon={Pencil} label="Edit habit"
            onClick={() => { onOpenTask(menuTask); setMenuFor(null); }} />
          <Action Icon={Copy} label="Duplicate"
            hint="Same schedule and settings, fresh streak"
            onClick={() => { onDuplicate(menuTask.id); setMenuFor(null); }} />
          <Action Icon={ChevronUp} label="Move up" disabled={menuIdx <= 0}
            onClick={() => { onMove(menuTask.id, activeIds, -1); setMenuFor(null); }} />
          <Action Icon={ChevronDown} label="Move down" disabled={menuIdx < 0 || menuIdx >= activeIds.length - 1}
            onClick={() => { onMove(menuTask.id, activeIds, 1); setMenuFor(null); }} />
          <Action Icon={Pause} label="Pause"
            hint="Stops showing in your plan, keeps every day you've logged"
            onClick={() => { onArchive(menuTask.id, true); setMenuFor(null); }} />
          <Action Icon={Trash2} label="Delete" danger
            hint="Removes the habit itself"
            onClick={() => { onDelete(menuTask.id); setMenuFor(null); }} />
        </div>
      </Sheet>
    </div>
  );
}

function HabitCard({ task, kind, accent, dayLog, freezes, onOpen, onMenu }) {
  const streak = habitStreakProtected(task, dayLog, freezes);
  const dueToday = occursOn(task, todayStr());
  const doneToday = dueToday && isDone(task, todayStr(), dayLog);
  const milestone = nextMilestone(streak);
  const reward = rewardProgress(task, streak);
  const pillar = task.pillarId ? P_BY_ID[task.pillarId] : null;

  return (
    <div style={{
      ...styles.card, marginBottom: 0,
      borderColor: dueToday ? alpha(accent, 0.28) : C.border,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{
          width: 6, height: 6, borderRadius: 3, flexShrink: 0,
          background: PRIORITY[task.priority || "med"].color,
        }} />
        <button onClick={onOpen} style={{
          flex: 1, minWidth: 0, background: "none", border: "none", padding: 0,
          cursor: "pointer", textAlign: "left",
        }}>
          <span style={{ color: C.text, fontSize: 14, fontWeight: 550 }}>{task.text}</span>
        </button>
        {streak > 0 && (
          <span style={{ ...styles.tag, color: C.gold, background: C.goldSoft }}>
            <Flame size={9} /> {streak}
          </span>
        )}
        {dueToday && (
          <span style={{
            ...styles.tag,
            color: doneToday ? C.green : accent,
            background: alpha(doneToday ? C.green : accent, 0.14),
          }}>
            {doneToday ? "Done today" : "Today"}
          </span>
        )}
        <button onClick={onMenu} title="Habit actions" style={{
          background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 2, flexShrink: 0,
        }}>
          <MoreHorizontal size={17} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
        <span style={styles.tag}><Repeat size={9} /> {describeRecurrence(task.recurrence)}</span>
        {task.time && (
          <span style={styles.tag}>
            {task.reminder === false ? <BellOff size={9} /> : <Bell size={9} />} {formatTime12(task.time)}
          </span>
        )}
        {pillar && (
          <span style={{ ...styles.tag, color: pillar.color, background: alpha(pillar.color, 0.13) }}>
            <pillar.Icon size={9} /> {pillar.name}
          </span>
        )}
        {task.twoMin && <span style={styles.tag}><Zap size={9} /> {task.twoMin}</span>}
        {task.timerMinutes && <span style={styles.tag}><Timer size={9} /> {task.timerMinutes} min</span>}
        {task.trigger && (
          <span style={{ ...styles.tag, color: C.red, background: alpha(C.red, 0.12) }}>
            Trigger: {task.trigger}
          </span>
        )}
      </div>

      {kind === "build" && (milestone || reward) && (
        <p style={{ color: C.faint, fontSize: 10.5, margin: "9px 0 0", lineHeight: 1.5 }}>
          {milestone && streak > 0 && `${milestone - streak} to your ${milestone}-day mark`}
          {milestone && streak > 0 && reward && " · "}
          {reward && (reward.ready
            ? <b style={{ color: C.gold }}>Reward ready: {reward.text}</b>
            : `${reward.remaining} to unlock: ${reward.text}`)}
        </p>
      )}
    </div>
  );
}

function Action({ Icon, label, hint, onClick, danger, disabled }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md,
      padding: "13px 14px", cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.4 : 1, color: danger ? C.red : C.text,
    }}>
      <Icon size={16} color={danger ? C.red : C.muted} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontSize: 14, fontFamily: F.body }}>{label}</span>
        {hint && <span style={{ display: "block", color: C.faint, fontSize: 11, marginTop: 2 }}>{hint}</span>}
      </span>
    </button>
  );
}
