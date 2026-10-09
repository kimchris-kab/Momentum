import React, { useMemo } from "react";
import { CalendarCheck, Check, Compass, Flame, Mail, Moon, Target } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { todayStr } from "../lib/date.js";
import { SCORE_WORDS, activeVirtue, dayNumber, entryFor, practiceFor, stats, virtueSettings } from "../lib/virtue.js";
import { dueLetters } from "../lib/letters.js";
import { examenFor, examenSettings } from "../lib/examen.js";
import { engaged } from "../lib/character.js";
import { focusFor, reviewReady } from "../lib/weekly.js";

const TONE = C.orange;

/**
 * Today's one practice for the virtue being worked on, and the day's one question. Answering is a tap,
 * from here or from the evening notification; the screen behind it has the rest. Quiet when it's switched off.
 */
export default function CharacterCard({ state, onAnswer, onOpen, onOpenTemper, onOpenLetter, onOpenExamen, onOpenWeek, onDismissTeaser }) {
  const cfg = virtueSettings(state.settings);
  const today = todayStr();
  const active = useMemo(() => activeVirtue(state), [state.virtue]); // eslint-disable-line react-hooks/exhaustive-deps
  const due = useMemo(() => dueLetters(state), [state.letters, state.tasks, state.urgeLog]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cfg.on) return null;
  const ex = examenSettings(state.settings);
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const weekReady = engaged(state) && reviewReady(state, now);
  const focus = focusFor(state, today);
  const askExamen = ex.on && engaged(state) && hhmm >= ex.time && !examenFor(state, today);

  return (
    <>
      {due.length > 0 && (
        <div style={{ ...styles.card, borderColor: alpha(C.gold, 0.4), background: `linear-gradient(135deg, ${alpha(C.gold, 0.1)}, ${C.surface})` }}>
          <p style={{ display: "flex", alignItems: "center", gap: 7, color: C.gold, fontSize: 11, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase", margin: 0 }}>
            <Mail size={13} /> A letter from you has arrived
          </p>
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: "6px 0 10px" }}>
            {due.length === 1 ? "You wrote it for today." : `${due.length} letters you wrote for today.`} Open it when you have a quiet minute.
          </p>
          <button onClick={() => onOpenLetter(due[0].id)} style={{ ...styles.cta, height: 40, fontSize: 13 }}>Open it</button>
        </div>
      )}
      {focus && (
        <p style={{ display: "flex", alignItems: "center", gap: 7, color: C.muted, fontSize: 12.5, margin: "0 2px 10px" }}>
          <Target size={13} color={C.teal} /> This week: <span style={{ color: C.text }}>{focus}</span>
        </p>
      )}
      {weekReady && (
        <div style={{ ...styles.card, borderColor: alpha(C.teal, 0.35) }}>
          <p style={{ display: "flex", alignItems: "center", gap: 7, color: C.teal, fontSize: 11, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase", margin: 0 }}>
            <CalendarCheck size={13} /> Your week in review
          </p>
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: "6px 0 10px" }}>What went well, where you slipped, and the one thing to carry into next week.</p>
          <button onClick={onOpenWeek} style={{ ...styles.ghostCta, height: 40, fontSize: 13 }}>Read it</button>
        </div>
      )}
      {virtueCard()}
      {askExamen && (
        <div style={{ ...styles.card, borderColor: alpha(C.purple, 0.3) }}>
          <p style={{ display: "flex", alignItems: "center", gap: 7, color: C.purple, fontSize: 11, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase", margin: 0 }}>
            <Moon size={13} /> Evening examen
          </p>
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: "6px 0 10px" }}>Sixty seconds: what went well, where you fell short, what you'll change tomorrow.</p>
          <button onClick={onOpenExamen} style={{ ...styles.ghostCta, height: 40, fontSize: 13 }}>Do it now</button>
        </div>
      )}
    </>
  );

  function virtueCard() {
  if (!active) {
    // Not before there is anything on Today at all: someone who has only just arrived has plenty to read already.
    if (state.settings?.virtueTeaserDismissed || (!(state.tasks || []).length && !Object.keys(state.dayLog || {}).length)) return null;
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
}
