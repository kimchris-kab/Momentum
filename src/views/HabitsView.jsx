import React, { useEffect, useMemo, useState } from "react";
import { Ban, Bell, BellOff, Check, Flame, Gift, Plus, Repeat, Sprout, Timer, Zap } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { PRIORITY, WEEKDAYS } from "../data/constants.js";
import { formatTime12, todayStr } from "../lib/date.js";
import { describeRecurrence, isDone, occursOn, weeklyRule } from "../lib/tasks.js";
import { habitStreakProtected, nextMilestone, rewardProgress } from "../lib/habits.js";
import {
  notificationPermission, reminderCapability, requestNotificationPermission, scheduleReminders,
  sendTestReminder,
} from "../lib/notify.js";
import { Card, EmptyState, IconButton, Pill, SegmentedControl, SectionLabel } from "../components/ui.jsx";

export default function HabitsView({ state, onAdd, onOpenTask, onBack, onSetSetting }) {
  const { tasks, dayLog, settings } = state;
  const [kind, setKind] = useState("build");
  const [perm, setPerm] = useState("default");
  const capability = useMemo(() => reminderCapability(), []);

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

  const [text, setText] = useState("");
  const [days, setDays] = useState(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  const [time, setTime] = useState("");
  const [prio, setPrio] = useState("high");

  const habits = useMemo(
    () => tasks.filter((t) => t.kind === kind && t.recurrence && !t.archivedAt),
    [tasks, kind]);

  const toggleDay = (k) => setDays((d) => d.includes(k) ? d.filter((x) => x !== k) : [...d, k]);

  const add = () => {
    if (!text.trim() || days.length === 0) return;
    onAdd({
      text: text.trim(),
      kind,
      priority: prio,
      time: time || null,
      recurrence: weeklyRule([...days]),
      startDate: todayStr(),
    });
    setText("");
    setTime("");
  };

  const accent = kind === "break" ? C.red : C.gold;

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
          {perm !== "granted" && capability.level === "foreground" && (
            <p style={{ color: C.faint, fontSize: 10.5, margin: "10px 0 0", lineHeight: 1.5 }}>
              {capability.label}
            </p>
          )}
        </Card>
      )}

      <SegmentedControl
        value={kind}
        onChange={setKind}
        options={[{ id: "build", label: "Building" }, { id: "break", label: "Avoiding" }]}
        style={{ marginBottom: 16 }}
      />

      <Card>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={kind === "build" ? "e.g. Morning prayer, gym, read" : "e.g. Doomscrolling, late-night snacking"}
            style={{ ...styles.input, flex: 1, fontSize: 13.5 }} />
          <button onClick={add} style={{ ...styles.addBtn, background: accent }}><Plus size={18} /></button>
        </div>

        <p style={{ color: C.muted, fontSize: 10.5, margin: "12px 0 6px", letterSpacing: 0.4, textTransform: "uppercase" }}>
          Repeats on
        </p>
        <div style={{ display: "flex", gap: 5 }}>
          {WEEKDAYS.map((d) => {
            const on = days.includes(d.key);
            return (
              <button key={d.key} onClick={() => toggleDay(d.key)} style={{
                flex: 1, height: 34, borderRadius: 10, cursor: "pointer", fontSize: 11.5, fontWeight: 600,
                fontFamily: F.body,
                border: `1px solid ${on ? accent : C.border}`,
                background: on ? alpha(accent, 0.14) : "transparent",
                color: on ? accent : C.muted,
              }}>{d.letter}</button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          <div style={styles.fieldShell}>
            <Repeat size={13} color={C.muted} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              style={styles.bareInput} />
          </div>
          {Object.entries(PRIORITY).map(([k, v]) => (
            <Pill key={k} on={prio === k} color={v.color} onClick={() => setPrio(k)}>{v.label}</Pill>
          ))}
        </div>
      </Card>

      <SectionLabel>{kind === "build" ? "Building" : "Avoiding"} · {habits.length}</SectionLabel>

      {habits.length === 0 ? (
        <EmptyState
          Icon={kind === "build" ? Sprout : Ban}
          title={kind === "build" ? "No habits yet" : "Nothing on the avoid list"}
          hint={kind === "build"
            ? "Add one above — it'll appear in your plan on the days you chose."
            : "Name what you're cutting out and check it off each day you stay clean."}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {habits.map((t) => {
            const streak = habitStreakProtected(t, dayLog, state.freezes);
            const dueToday = occursOn(t, todayStr());
            const milestone = nextMilestone(streak);
            const reward = rewardProgress(t, streak);
            return (
              <button key={t.id} onClick={() => onOpenTask(t)} style={{
                ...styles.card, marginBottom: 0, width: "100%", textAlign: "left", cursor: "pointer",
                borderColor: dueToday ? alpha(accent, 0.28) : C.border,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: 3, flexShrink: 0,
                    background: PRIORITY[t.priority || "med"].color,
                  }} />
                  <span style={{ flex: 1, color: C.text, fontSize: 14, fontWeight: 550 }}>{t.text}</span>
                  {streak > 0 && (
                    <span style={{ ...styles.tag, color: C.gold, background: C.goldSoft }}>
                      <Flame size={9} /> {streak}
                    </span>
                  )}
                  {dueToday && (
                    <span style={{
                      ...styles.tag, color: isDone(t, todayStr(), dayLog) ? C.green : accent,
                      background: alpha(isDone(t, todayStr(), dayLog) ? C.green : accent, 0.14),
                    }}>
                      {isDone(t, todayStr(), dayLog) ? "Done today" : "Today"}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
                  <span style={styles.tag}><Repeat size={9} /> {describeRecurrence(t.recurrence)}</span>
                  {t.time && (
                    <span style={styles.tag}>
                      {t.reminder === false ? <BellOff size={9} /> : <Bell size={9} />} {formatTime12(t.time)}
                    </span>
                  )}
                  {t.twoMin && <span style={styles.tag}><Zap size={9} /> {t.twoMin}</span>}
                  {t.timerMinutes && <span style={styles.tag}><Timer size={9} /> {t.timerMinutes} min</span>}
                  {t.trigger && <span style={{ ...styles.tag, color: C.red, background: alpha(C.red, 0.12) }}>
                    Trigger: {t.trigger}
                  </span>}
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
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
