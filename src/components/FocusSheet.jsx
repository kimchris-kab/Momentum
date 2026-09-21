import React, { useState } from "react";
import { Check, Pause, Play, RotateCcw, Timer as TimerIcon } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { pillarOf } from "../data/constants.js";
import { fmtDuration, shouldLog } from "../lib/focus.js";
import { TimerRing, useTimer } from "./Timer.jsx";
import { Pill, Sheet } from "./ui.jsx";

// Presets rather than a free number: picking a length should take one tap, and these are the
// three that people actually use. Stopwatch is there because plenty of work doesn't have a
// length you can name in advance, and forcing a guess just produces a wrong one.
const PRESETS = [15, 25, 45];

export default function FocusSheet({ open, task, onClose, onLog, onComplete }) {
  if (!open || !task) return null;
  return <FocusBody key={task.id} task={task} onClose={onClose} onLog={onLog} onComplete={onComplete} />;
}

function FocusBody({ task, onClose, onLog, onComplete }) {
  const [minutes, setMinutes] = useState(task.timerMinutes || 25);
  const [countUp, setCountUp] = useState(false);
  const total = minutes * 60;
  const timer = useTimer({ totalSecs: total, countUp, resetKey: `${minutes}:${countUp}` });
  const pillar = pillarOf(task.pillarId);
  const accent = pillar?.color || C.gold;

  // Whatever route you leave by, the time you actually spent is what gets recorded.
  const flush = (completed = false) => {
    if (shouldLog(timer.elapsed)) {
      onLog({ task, seconds: timer.elapsed, planned: countUp ? null : total, completed });
    }
  };
  const close = () => { flush(false); onClose(); };
  const finish = () => { flush(true); onComplete(task); onClose(); };

  const pickPreset = (m) => { setCountUp(false); setMinutes(m); };

  return (
    <Sheet open onClose={close} title="Focus">
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        {pillar && (
          <span style={{ ...styles.tag, color: pillar.color, background: alpha(pillar.color, 0.14) }}>
            <pillar.Icon size={10} /> {pillar.name}
          </span>
        )}
        <h2 style={{ ...styles.h2, fontSize: 21, margin: "9px 0 0" }}>{task.text}</h2>
      </div>

      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        {PRESETS.map((m) => (
          <Pill key={m} on={!countUp && minutes === m} color={accent} onClick={() => pickPreset(m)}>
            {m} min
          </Pill>
        ))}
        {task.timerMinutes && !PRESETS.includes(task.timerMinutes) && (
          <Pill on={!countUp && minutes === task.timerMinutes} color={accent}
            onClick={() => pickPreset(task.timerMinutes)}>
            {task.timerMinutes} min
          </Pill>
        )}
        <Pill on={countUp} color={accent} onClick={() => setCountUp(true)}>Stopwatch</Pill>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <TimerRing
          elapsed={timer.elapsed} total={total} countUp={countUp}
          running={timer.running} color={accent}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={timer.toggle} style={{
            ...styles.ghostCta, width: "auto", padding: "0 20px", height: 42, fontSize: 13,
            borderColor: alpha(accent, 0.4), color: accent,
          }}>
            {timer.running ? <Pause size={14} /> : <Play size={14} />}
            {timer.running ? "Pause" : timer.elapsed > 0 ? "Resume" : "Start"}
          </button>
          <button onClick={timer.reset} title="Reset" style={{
            ...styles.ghostCta, width: "auto", padding: "0 15px", height: 42, fontSize: 13,
          }}>
            <RotateCcw size={14} />
          </button>
        </div>
        {timer.elapsed > 0 && (
          <p style={{ color: C.faint, fontSize: 11.5, margin: 0 }}>
            {shouldLog(timer.elapsed)
              ? <>{fmtDuration(timer.elapsed)} will be logged against this.</>
              : "A few more seconds before this is worth logging."}
          </p>
        )}
      </div>

      <button onClick={finish} style={{
        ...styles.cta, background: `linear-gradient(135deg, ${accent}, ${alpha(accent, 0.7)})`,
      }}>
        <Check size={18} /> Done — mark it complete
      </button>

      <button onClick={close} style={{ ...styles.linkBtn, margin: "14px auto 0", color: C.muted }}>
        <TimerIcon size={12} /> {shouldLog(timer.elapsed) ? "Log the time and close" : "Close"}
      </button>
    </Sheet>
  );
}
