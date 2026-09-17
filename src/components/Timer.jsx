import React, { useCallback, useEffect, useRef, useState } from "react";
import { C, F } from "../theme.js";
import { mmss } from "../lib/focus.js";

// One timer behind both the habit start ritual and a general focus session. Both need the
// same thing — elapsed time, honestly measured — and elapsed is what gets logged, whether
// the clock was counting down to a target or just counting up.
//
// Time comes from the wall clock rather than a tick count: a phone that sleeps or a
// backgrounded tab throttles setInterval, and a timer that quietly loses ten minutes is
// worse than no timer.
export function useTimer({ totalSecs = 0, countUp = false, resetKey }) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startedAt = useRef(null);
  const base = useRef(0);

  const stopTicking = useCallback(() => { startedAt.current = null; }, []);

  const reset = useCallback(() => {
    setRunning(false);
    setElapsed(0);
    base.current = 0;
    stopTicking();
  }, [stopTicking]);

  useEffect(() => { reset(); }, [resetKey, reset]);

  useEffect(() => {
    if (!running) return undefined;
    startedAt.current = Date.now();
    const id = setInterval(() => {
      const since = (Date.now() - startedAt.current) / 1000;
      const next = base.current + since;
      if (!countUp && totalSecs > 0 && next >= totalSecs) {
        setElapsed(totalSecs);
        base.current = totalSecs;
        // Clearing this first stops the cleanup below adding the same stretch a second
        // time, which would inflate the elapsed total on resume after a finished timer.
        startedAt.current = null;
        setRunning(false);
        return;
      }
      setElapsed(next);
    }, 250);
    return () => {
      clearInterval(id);
      if (startedAt.current) base.current += (Date.now() - startedAt.current) / 1000;
      startedAt.current = null;
    };
  }, [running, countUp, totalSecs]);

  const toggle = useCallback(() => setRunning((r) => !r), []);
  const secs = Math.floor(elapsed);
  const remaining = countUp ? null : Math.max(0, totalSecs - secs);

  return {
    elapsed: secs,
    remaining,
    running,
    toggle,
    reset,
    pause: () => setRunning(false),
    started: secs > 0 || running,
    finished: !countUp && totalSecs > 0 && secs >= totalSecs,
  };
}

export function TimerRing({ elapsed, total, countUp, running, size = 150, color = C.gold }) {
  const r = size / 2 - 7;
  const circ = 2 * Math.PI * r;
  const pct = countUp || !total ? 0 : Math.min(1, elapsed / total);
  const done = !countUp && total > 0 && elapsed >= total;
  const display = countUp ? elapsed : Math.max(0, total - elapsed);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8} />
        {!countUp && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={done ? C.green : color} strokeWidth={8}
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ - pct * circ}
            style={{ transition: "stroke-dashoffset .3s linear" }}
          />
        )}
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{
          color: C.text, fontFamily: F.display, fontSize: size > 130 ? 32 : 26, fontWeight: 600,
        }}>
          {mmss(display)}
        </span>
        <span style={{ color: C.faint, fontSize: 10, letterSpacing: 0.5 }}>
          {done ? "TIME'S UP" : running ? "IN PROGRESS" : elapsed > 0 ? "PAUSED" : "READY"}
        </span>
      </div>
    </div>
  );
}
