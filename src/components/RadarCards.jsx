import React, { useEffect, useMemo, useState } from "react";
import { Check, Radar as RadarIcon, Waves } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { todayStr } from "../lib/date.js";
import { radar, radarLine, rescueFor, hardDay } from "../lib/radar.js";

// A minute-by-minute clock. The radar is about "right now", so it can't be worked out once and kept.
function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const LEVEL = {
  high: { label: "HIGH", color: C.orange },
  rising: { label: "RISING", color: C.gold },
};

/**
 * Today's warning for a habit being quit, when its own history says the next stretch is a hard one.
 * It shows its reasons — the counts they come from — so it can be judged rather than obeyed, and
 * puts what the person wrote while calm in front of them. Silent while the log is too thin to say
 * anything, and while things are calm.
 */
export function RadarCard({ state, onUrge }) {
  const now = useMinute();
  const today = todayStr();
  const [quiet, setQuiet] = useState({}); // habit id → the time it was waved away until
  const quits = useMemo(
    () => (state.tasks || []).filter((t) => t.kind === "break" && t.recurrence && !t.archivedAt),
    [state.tasks],
  );
  const readings = quits
    .map((task) => ({ task, r: radar(task, state, now) }))
    .filter(({ task, r }) => (r.level === "high" || r.level === "rising") && !(quiet[task.id] > now))
    .slice(0, 2);
  if (!readings.length) return null;

  return (
    <>
      {readings.map(({ task, r }) => {
        const lv = LEVEL[r.level];
        const steps = rescueFor(task);
        return (
          <div key={task.id} role="group" aria-label={`Urge radar: ${task.text}`} style={{
            background: `linear-gradient(135deg, ${alpha(lv.color, 0.1)}, ${C.surface})`,
            border: `1px solid ${alpha(lv.color, 0.35)}`, borderRadius: R.lg, padding: 16, marginBottom: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RadarIcon size={14} color={lv.color} />
              <span style={{ color: lv.color, fontSize: 11, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase" }}>
                Urge radar · {task.text}
              </span>
              <span style={{
                marginLeft: "auto", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, padding: "3px 9px", borderRadius: 999,
                color: "#14131f", background: lv.color,
              }}>{lv.label}</span>
            </div>

            <p style={{ color: C.text, fontSize: 15, fontWeight: 650, margin: "9px 0 0", fontFamily: F.display, lineHeight: 1.35 }}>
              {radarLine(r)}
            </p>

            <ul style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: "7px 0 0", paddingLeft: 17 }}>
              {r.reasons.map((x) => <li key={x}>{x}</li>)}
            </ul>

            {/* What they wrote when calm, in their own words: the reason it exists. */}
            <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 7 }}>
              {steps.map((s) => (
                <div key={s.kind} style={{
                  background: alpha(C.teal, 0.07), border: `1px solid ${alpha(C.teal, 0.2)}`,
                  borderRadius: R.md, padding: "9px 12px",
                }}>
                  <p style={{ color: C.teal, fontSize: 10.5, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase", margin: 0 }}>{s.label}</p>
                  <p style={{ color: C.text, fontSize: 13, lineHeight: 1.5, margin: "3px 0 0", fontFamily: s.kind === "default" ? undefined : F.display }}>{s.text}</p>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => onUrge(task)} style={{ ...styles.cta, height: 42, fontSize: 13, flex: 1 }}>
                <Waves size={15} /> Ride it out now
              </button>
              <button onClick={() => setQuiet((q) => ({ ...q, [task.id]: now + 2 * 3600000 }))}
                style={{ ...styles.ghostCta, height: 42, fontSize: 12.5, width: 104 }}>
                I'm fine
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Both cards as one piece, so Today can load them together, after it has drawn. */
export default function RadarCards({ state, onUrge, onOpenTask, onDoSmall }) {
  return (
    <>
      {onUrge && <RadarCard state={state} onUrge={onUrge} />}
      <RescueCard state={state} onOpenTask={onOpenTask} onDoSmall={onDoSmall} />
    </>
  );
}

/**
 * A habit that looks like it's about to slip today, with the small version to fall back on. The
 * small version counts: finishing the two-minute one keeps the chain and, more often than not,
 * turns into the real thing. At most two, because a rescue for everything is a second to-do list.
 */
export function RescueCard({ state, onDoSmall, onOpenTask }) {
  const now = useMinute();
  const list = useMemo(() => hardDay(state, now), [state, now]);
  if (!list.length) return null;
  return (
    <div role="group" aria-label="Rescue" style={{
      background: `linear-gradient(135deg, ${alpha(C.gold, 0.09)}, ${C.surface})`,
      border: `1px solid ${alpha(C.gold, 0.3)}`, borderRadius: R.lg, padding: 16, marginBottom: 12,
    }}>
      <p style={{ color: C.gold, fontSize: 11, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase", margin: 0 }}>
        Save the chain
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
        {list.map(({ task, reason, tiny }) => (
          <div key={task.id}>
            <button onClick={() => onOpenTask(task)} style={{ ...styles.linkBtn, color: C.text, fontSize: 14.5, fontWeight: 650, fontFamily: F.display, padding: 0 }}>
              {task.text}
            </button>
            <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, margin: "2px 0 0" }}>{reason}</p>
            <button onClick={() => onDoSmall(task)} aria-label={`Did the small version of ${task.text}`}
              style={{ ...styles.ghostCta, height: 42, marginTop: 8, fontSize: 13, width: "100%", textAlign: "left", justifyContent: "flex-start", gap: 10, padding: "0 14px" }}>
              <Check size={15} color={C.gold} />
              <span style={{ flex: 1, minWidth: 0 }}>Just: {tiny}</span>
            </button>
          </div>
        ))}
      </div>
      <p style={{ color: C.faint, fontSize: 11, margin: "10px 0 0" }}>
        The small version counts. Tap it when it's done.
      </p>
    </div>
  );
}
