import React, { useState } from "react";
import {
  ArrowRight, Calendar, Check, Layers, PartyPopper, Sparkles, Target, TriangleAlert,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { WOOP_STEPS, woopOf, woopProgress } from "../lib/woop.js";
import { expectation, typeOf } from "../lib/habitTypes.js";
import { Card, SectionLabel, Sheet } from "./ui.jsx";

// ---- WOOP (Oettingen's mental contrasting) ----
// Four steps, in order, one at a time. Doing them out of order defeats the point: the
// contrast only works if the wish and the outcome are vivid BEFORE the obstacle lands.
export default function WoopSheet({ open, goal, onClose, onSave }) {
  if (!open || !goal) return null;
  return <WoopBody key={goal.id} goal={goal} onClose={onClose} onSave={onSave} />;
}

function WoopBody({ goal, onClose, onSave }) {
  const [woop, setWoop] = useState(() => woopOf(goal));
  const [step, setStep] = useState(() => {
    const filled = WOOP_STEPS.findIndex((s) => !(woopOf(goal)[s.id] || "").trim());
    return filled === -1 ? 0 : filled;
  });

  const current = WOOP_STEPS[step];
  const value = woop[current.id] || "";
  const last = step === WOOP_STEPS.length - 1;

  const next = () => {
    if (last) { onSave(goal.id, { ...woop, at: Date.now() }); onClose(); }
    else setStep((s) => s + 1);
  };

  return (
    <Sheet open onClose={onClose} title={goal.text}>
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {WOOP_STEPS.map((s, i) => (
          <span key={s.id} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= step ? C.gold : C.surface3,
          }} />
        ))}
      </div>

      <p style={{ color: C.gold, fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 6px" }}>
        {current.label} · {step + 1} of {WOOP_STEPS.length}
      </p>
      <h2 style={{ ...styles.h2, fontSize: 19, margin: "0 0 8px" }}>{current.prompt}</h2>
      <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: "0 0 14px" }}>{current.help}</p>

      <textarea
        value={value} autoFocus rows={3}
        onChange={(e) => setWoop((w) => ({ ...w, [current.id]: e.target.value }))}
        placeholder={current.placeholder}
        aria-label={current.label}
        style={{ ...styles.input, resize: "none", fontSize: 14, lineHeight: 1.55 }}
      />

      <button onClick={next} disabled={!value.trim()} style={{
        ...styles.cta, marginTop: 16,
        opacity: value.trim() ? 1 : 0.45, cursor: value.trim() ? "pointer" : "default",
      }}>
        {last ? <><Check size={17} /> Save the plan</> : <>Next <ArrowRight size={16} /></>}
      </button>

      {step > 0 && (
        <button onClick={() => setStep((s) => s - 1)} style={{ ...styles.linkBtn, margin: "12px auto 0", color: C.muted }}>
          Back
        </button>
      )}
    </Sheet>
  );
}

/** Nudge toward a contrast pass on goals that don't have one. */
export function WoopPrompt({ goals, onStart }) {
  if (!goals?.length) return null;
  const first = goals[0];
  const done = woopProgress(first);
  return (
    <div style={{
      ...styles.card, marginBottom: 12, borderColor: alpha(C.purple, 0.28),
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Target size={16} color={C.purple} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>
            “{first.text}” has no plan yet
          </p>
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, margin: "5px 0 0" }}>
            Four questions. Imagining a goal on its own measurably lowers the odds of reaching
            it — naming the obstacle and pre-deciding the response is the half that works.
          </p>
        </div>
      </div>
      <button onClick={() => onStart(first)} style={{ ...styles.linkBtn, color: C.purple, marginTop: 10 }}>
        <ArrowRight size={12} /> {done ? `Finish it — ${done}/4` : "Run the pass"}
      </button>
    </div>
  );
}

// ---- Phase 8: fresh start ----
export function FreshStartCard({ prompt, onAccept, onDismiss }) {
  if (!prompt) return null;
  return (
    <div style={{
      ...styles.card, marginBottom: 12,
      borderColor: alpha(C.teal, 0.3),
      background: `linear-gradient(135deg, ${alpha(C.teal, 0.08)}, ${C.surface})`,
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Calendar size={16} color={C.teal} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>{prompt.title}</p>
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: "5px 0 0" }}>{prompt.body}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
        <button onClick={onAccept} style={{ ...styles.linkBtn, color: C.teal }}>
          <Sparkles size={12} /> Start the count today
        </button>
        <button onClick={onDismiss} style={{ ...styles.linkBtn, color: C.faint, marginLeft: "auto" }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

/** The return after a gap, celebrated on its own terms. */
export function ComebackCard({ comebacks, onDismiss }) {
  if (!comebacks?.length) return null;
  const first = comebacks[0];
  return (
    <div style={{
      ...styles.card, marginBottom: 12,
      borderColor: alpha(C.green, 0.3),
      background: `linear-gradient(135deg, ${alpha(C.green, 0.09)}, ${C.surface})`,
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <PartyPopper size={16} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>
            Back on “{first.task.text}”
          </p>
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: "5px 0 0" }}>
            {first.missedDays === 1
              ? "One missed and straight back. That's the whole skill — the returning, not the streak."
              : `${first.missedDays} days off and you're back. Most people don't come back at all.`}
          </p>
        </div>
        <button onClick={onDismiss} style={{
          background: "none", border: "none", cursor: "pointer", color: C.faint, fontSize: 11, flexShrink: 0,
        }}>
          Got it
        </button>
      </div>
    </div>
  );
}

// ---- Phase 10: start small ----
export function StartSmallCard({ check, onOpenHabits }) {
  if (!check) return null;
  return (
    <>
      <SectionLabel>Worth knowing</SectionLabel>
      <Card style={{ borderColor: alpha(C.orange, 0.28) }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <TriangleAlert size={16} color={C.orange} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>
              {check.count} habits at once
            </p>
            <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: "5px 0 0" }}>
              {check.text}
            </p>
          </div>
        </div>
        {onOpenHabits && (
          <button onClick={onOpenHabits} style={{ ...styles.linkBtn, color: C.orange, marginTop: 10 }}>
            <Layers size={12} /> Park a few
          </button>
        )}
      </Card>
    </>
  );
}

/** Phase 9: an honest time window for the kind of habit this is. */
export function ExpectationNote({ task, weeksIn }) {
  const type = typeOf(task);
  const exp = expectation(task, weeksIn ?? null);
  if (!type || !exp) return null;
  return (
    <p style={{ color: C.faint, fontSize: 11, lineHeight: 1.55, margin: "8px 0 0" }}>
      {exp.hint || exp.text}
    </p>
  );
}
