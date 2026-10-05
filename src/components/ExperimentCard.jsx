import React from "react";
import { Check, FlaskConical } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { addDays, todayStr } from "../lib/date.js";
import { dayNumber, liveToday } from "../lib/experimentPlan.js";

// What a running experiment asks of today. The whole design depends on you knowing which kind of
// day it is, so this sits near the top of Today rather than being something to go and look up.
export default function ExperimentCard({ state, onFollow, onOpen, onDismissTeaser }) {
  const today = todayStr();
  const live = liveToday(state, today);
  const experiments = state.experiments || [];

  // Nothing running and nothing ever tried: one gentle offer, once the app has something to measure.
  const haveData = (state.checkins || []).length + Object.keys(state.dayLog || {}).length >= 5;
  if (!live.length) {
    if (experiments.length || !haveData || state.settings?.experimentsTeaserDismissed) return null;
    return (
      <div style={{
        background: `linear-gradient(135deg, ${alpha(C.teal, 0.1)}, ${C.surface})`,
        border: `1px solid ${alpha(C.teal, 0.28)}`, borderRadius: R.lg, padding: 16, marginBottom: 12,
      }}>
        <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
          <FlaskConical size={17} color={C.teal} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: C.text, fontSize: 14.5, fontWeight: 650, margin: 0, fontFamily: F.display }}>
              Find out what actually works for you
            </p>
            <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: "4px 0 0" }}>
              Pick one change — phone out of the bedroom, no caffeine after noon. The app flips a
              coin for which days you do it, then tells you honestly whether it made a difference.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onOpen} style={{ ...styles.cta, height: 40, fontSize: 13, flex: 1 }}>
            <FlaskConical size={14} /> Start an experiment
          </button>
          <button onClick={onDismissTeaser} style={{ ...styles.ghostCta, height: 40, fontSize: 12.5, width: 92 }}>
            Not now
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {live.map(({ exp, assignment }) => {
        const doDay = assignment === "do";
        const followed = !!exp.followed?.[today];
        const accent = doDay ? C.gold : C.muted;
        return (
          <div key={exp.id} role="group" aria-label={`Experiment: ${exp.title}`} style={{
            background: doDay ? `linear-gradient(135deg, ${alpha(C.gold, 0.1)}, ${C.surface})` : C.surface,
            border: `1px solid ${doDay ? alpha(C.gold, 0.32) : C.border}`,
            borderRadius: R.lg, padding: 16, marginBottom: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FlaskConical size={14} color={C.teal} />
              <span style={{ color: C.teal, fontSize: 11, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase" }}>
                Experiment · day {dayNumber(exp, today)} of {exp.days}
              </span>
              <button onClick={onOpen} style={{ ...styles.linkBtn, marginLeft: "auto", fontSize: 11.5 }}>Details</button>
            </div>

            <p style={{ color: C.text, fontSize: 15, fontWeight: 650, margin: "8px 0 0", fontFamily: F.display, lineHeight: 1.35 }}>
              {exp.title}
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 11 }}>
              <span style={{
                flexShrink: 0, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, padding: "4px 10px", borderRadius: 999,
                color: doDay ? "#14131f" : C.muted, background: doDay ? C.gold : alpha(C.muted, 0.16),
              }}>
                {doDay ? "DO IT" : "NORMAL DAY"}
              </span>
              <p style={{ color: doDay ? C.text : C.muted, fontSize: 13, lineHeight: 1.5, margin: 0, flex: 1, minWidth: 0 }}>
                {doDay
                  ? exp.change
                  : exp.mode === "flip" ? "Today the coin says don't. Carry on exactly as usual." : exp.change}
              </p>
            </div>

            {doDay && (
              <button
                onClick={() => onFollow(exp.id, today, !followed)}
                aria-pressed={followed}
                style={{
                  ...styles.ghostCta, height: 42, marginTop: 12, fontSize: 13, width: "100%",
                  borderColor: followed ? C.green : alpha(accent, 0.45), color: followed ? C.green : C.text,
                  background: followed ? alpha(C.green, 0.1) : "transparent",
                }}>
                <Check size={15} /> {followed ? "Done today" : "I did it"}
              </button>
            )}

            {/* The run so far: filled where you were asked to do it, hollow where you weren't. */}
            {exp.mode === "flip" && (
              <div style={{ display: "flex", gap: 4, marginTop: 12 }} aria-hidden="true">
                {Array.from({ length: exp.days }, (_, i) => {
                  const date = addDays(exp.startDate, i);
                  const asked = exp.assignments?.[date] === "do";
                  const past = date < today;
                  return (
                    <span key={date} title={date} style={{
                      flex: 1, height: 6, borderRadius: 3, maxWidth: 22,
                      background: asked ? (past && exp.followed?.[date] ? C.green : alpha(C.gold, past ? 0.35 : 0.9)) : "transparent",
                      border: asked ? "none" : `1.5px solid ${alpha(C.muted, past ? 0.35 : 0.7)}`,
                      outline: date === today ? `2px solid ${C.teal}` : "none", outlineOffset: 1,
                    }} />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
