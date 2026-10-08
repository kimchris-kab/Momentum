import React, { useMemo } from "react";
import { Check, Compass, Flame } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { todayStr } from "../lib/date.js";
import { SCORE_WORDS, activeVirtue, dayNumber, entryFor, practiceFor, stats, virtueSettings } from "../lib/virtue.js";

const TONE = C.orange;

/**
 * Today's one practice for the virtue being worked on, and the day's one question. Answering is a tap,
 * from here or from the evening notification; the screen behind it has the rest. Quiet when it's switched off.
 */
export default function CharacterCard({ state, onAnswer, onOpen, onOpenTemper, onDismissTeaser }) {
  const cfg = virtueSettings(state.settings);
  const today = todayStr();
  const active = useMemo(() => activeVirtue(state), [state.virtue]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cfg.on) return null;

  if (!active) {
    // Not on a first day: Today already has plenty to say to someone who has only just arrived.
    if (state.settings?.virtueTeaserDismissed || Object.keys(state.dayLog || {}).length < 3) return null;
    return (
      <div style={{ ...styles.card, borderColor: alpha(TONE, 0.3) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Compass size={14} color={TONE} />
          <span style={{ color: TONE, fontSize: 11, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase" }}>Character</span>
        </div>
        <p style={{ color: C.text, fontSize: 15, fontWeight: 650, margin: "8px 0 4px", fontFamily: F.display }}>Pick one trait to grow</p>
        <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: 0 }}>
          Patience, honesty, courage… You get one small thing to practise each day, and one question at the end of it.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
          <button onClick={onOpen} style={{ ...styles.cta, height: 40, flex: 1, fontSize: 13 }}>Choose one</button>
          <button onClick={onDismissTeaser} style={{ ...styles.linkBtn, color: C.faint, width: 80 }}>Not now</button>
        </div>
      </div>
    );
  }

  const entry = entryFor(state, active.id, today);
  const st = stats(state, active.id, today);
  return (
    <div role="group" aria-label={`${active.name}, today's practice`} style={{
      background: `linear-gradient(135deg, ${alpha(TONE, 0.1)}, ${C.surface})`,
      border: `1px solid ${alpha(TONE, 0.32)}`, borderRadius: R.lg, padding: 16, marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14 }}>{active.emoji}</span>
        <span style={{ color: TONE, fontSize: 11, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase", flex: 1 }}>
          {active.name} · day {dayNumber(active, today)}
        </span>
        {st.streak > 1 && (
          <span style={{ color: C.gold, fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Flame size={12} /> {st.streak}
          </span>
        )}
      </div>
      <p style={{ color: C.text, fontSize: 15, fontWeight: 600, margin: "9px 0 12px", fontFamily: F.display, lineHeight: 1.4 }}>
        {practiceFor(active, today)}
      </p>
      {entry ? (
        <p style={{ color: C.muted, fontSize: 12.5, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <Check size={14} color={C.green} /> {SCORE_WORDS[entry.score]} today.
          <button onClick={onOpen} style={{ ...styles.linkBtn, color: C.faint, marginLeft: "auto" }}>Open</button>
        </p>
      ) : (
        <>
          <p style={{ color: C.muted, fontSize: 11.5, margin: "0 0 7px" }}>Did you live {active.name.toLowerCase()} today?</p>
          <div style={{ display: "flex", gap: 7 }}>
            {[[2, "Lived it"], [1, "Partly"], [0, "Missed it"]].map(([score, label]) => (
              <button key={score} onClick={() => onAnswer({ date: today, score })}
                style={{ ...styles.ghostCta, height: 38, flex: 1, fontSize: 12.5 }}>{label}</button>
            ))}
          </div>
        </>
      )}
      <button onClick={onOpenTemper} style={{ ...styles.linkBtn, color: C.faint, margin: "11px 0 0", fontSize: 12 }}>
        Lost your cool? Log it
      </button>
    </div>
  );
}
