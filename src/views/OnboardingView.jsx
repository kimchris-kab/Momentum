import React, { useState } from "react";
import { ArrowRight, Check, Sparkles, Sprout, Target } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { PILLARS } from "../data/constants.js";
import { HABIT_TYPES, defaultCueFor } from "../lib/habitTypes.js";
import { IDENTITY_HELP, IDENTITY_PROMPT, START_SMALL_MAX } from "../lib/woop.js";
import { CUE_BY_ID } from "../lib/cues.js";
import { weeklyRule } from "../lib/tasks.js";
import { Card, Pill, SectionLabel } from "../components/ui.jsx";

const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// Spec item 1: identity first, habits as its evidence — and item 2: one to three, keystone
// first. Deliberately short. An onboarding flow that takes ten minutes is a flow most people
// abandon, and the research says the leverage is in the anchor, not the ceremony.
export default function OnboardingView({ state, onBack, onSetIdentity, onAddHabit, onDone }) {
  const [step, setStep] = useState(0);
  const [pillarId, setPillarId] = useState("health");
  const [identity, setIdentity] = useState(state.identities?.health || "");
  const [habits, setHabits] = useState([]);
  const [draft, setDraft] = useState("");
  const [habitType, setHabitType] = useState("keystone");
  const [cueDetail, setCueDetail] = useState("");

  const pillar = PILLARS.find((p) => p.id === pillarId) || PILLARS[0];
  const cueType = defaultCueFor(habitType);
  const cue = CUE_BY_ID[cueType];

  const addHabit = () => {
    if (!draft.trim() || habits.length >= START_SMALL_MAX) return;
    setHabits((h) => [...h, { text: draft.trim(), habitType, cueType, cueDetail: cueDetail.trim() }]);
    setDraft("");
    setCueDetail("");
  };

  const finish = () => {
    if (identity.trim()) onSetIdentity(pillarId, identity.trim());
    habits.forEach((h) => onAddHabit({
      text: h.text,
      kind: "build",
      pillarId,
      habitType: h.habitType,
      cueType: h.cueType,
      cueDetail: h.cueDetail || null,
      recurrence: weeklyRule(EVERY_DAY),
      priority: "high",
    }));
    onDone();
  };

  return (
    <div style={styles.page}>
      <button onClick={onBack} style={styles.back}>Skip for now</button>

      {step === 0 && (
        <>
          <p style={styles.eyebrow}>First</p>
          <h1 style={styles.h1}>Who are you becoming?</h1>
          <p style={styles.lede}>{IDENTITY_HELP}</p>

          <SectionLabel>Which part of your life?</SectionLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {PILLARS.map((p) => (
              <Pill key={p.id} on={pillarId === p.id} color={p.color}
                onClick={() => { setPillarId(p.id); setIdentity(state.identities?.[p.id] || ""); }}>
                {p.name}
              </Pill>
            ))}
          </div>

          <Card style={{ borderColor: alpha(pillar.color, 0.3) }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <pillar.Icon size={16} color={pillar.color} style={{ flexShrink: 0, marginTop: 3 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: C.muted, fontSize: 11.5, margin: "0 0 8px" }}>{IDENTITY_PROMPT}</p>
                <input
                  value={identity} autoFocus
                  onChange={(e) => setIdentity(e.target.value)}
                  placeholder="moves every day, even when it's raining"
                  aria-label="Identity"
                  style={{
                    ...styles.bareInput, width: "100%", color: C.text, fontSize: 15,
                    fontFamily: F.display, fontStyle: "italic", padding: 0,
                  }}
                />
              </div>
            </div>
          </Card>

          <button onClick={() => setStep(1)} disabled={!identity.trim()} style={{
            ...styles.cta, marginTop: 16, opacity: identity.trim() ? 1 : 0.45,
            cursor: identity.trim() ? "pointer" : "default",
          }}>
            Next <ArrowRight size={17} />
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <p style={styles.eyebrow}>Now the evidence</p>
          <h1 style={styles.h1}>Pick one to start</h1>
          <p style={styles.lede}>
            One to three, never more. Early habits need real attention and there isn't enough
            to go round — the fastest way to end up with none is to start with six. If one of
            these is a keystone (sleep, exercise, planning), lead with that and add the rest
            once it holds.
          </p>

          <Card>
            <p style={{ color: C.muted, fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", margin: "0 0 8px" }}>
              What kind of habit?
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {HABIT_TYPES.filter((t) => !t.breakOnly).map((t) => (
                <Pill key={t.id} on={habitType === t.id} onClick={() => setHabitType(t.id)}>
                  {t.label}
                </Pill>
              ))}
            </div>
            <p style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.5, margin: "0 0 12px" }}>
              {HABIT_TYPES.find((t) => t.id === habitType)?.note}
            </p>

            <input
              value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addHabit()}
              placeholder="e.g. Ten minutes of walking"
              aria-label="Habit"
              style={{ ...styles.input, fontSize: 14, marginBottom: 8 }}
            />
            <div style={{ ...styles.fieldShell, marginBottom: 10 }}>
              <span style={{ color: C.muted, fontSize: 12.5, flexShrink: 0 }}>{cue.prompt}</span>
              <input
                value={cueDetail} onChange={(e) => setCueDetail(e.target.value)}
                placeholder={cue.placeholder}
                aria-label="Cue"
                style={{ ...styles.bareInput, flex: 1 }}
              />
            </div>
            <p style={{ color: C.faint, fontSize: 11, lineHeight: 1.5, margin: "0 0 12px" }}>
              {cue.help}
            </p>

            <button onClick={addHabit} disabled={!draft.trim() || habits.length >= START_SMALL_MAX}
              style={{
                ...styles.ghostCta, height: 42, fontSize: 13,
                opacity: draft.trim() && habits.length < START_SMALL_MAX ? 1 : 0.45,
              }}>
              <Sprout size={14} /> Add it
            </button>
          </Card>

          {habits.length > 0 && (
            <>
              <SectionLabel>Starting with · {habits.length}/{START_SMALL_MAX}</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {habits.map((h, i) => (
                  <div key={`${h.text}-${i}`} style={{
                    display: "flex", alignItems: "center", gap: 9, background: C.surface,
                    border: `1px solid ${C.border}`, borderRadius: R.md, padding: "11px 13px",
                  }}>
                    <Check size={14} color={C.green} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: C.text, fontSize: 13, margin: 0 }}>{h.text}</p>
                      {h.cueDetail && (
                        <p style={{ color: C.faint, fontSize: 10.5, margin: "3px 0 0" }}>
                          {CUE_BY_ID[h.cueType].short.toLowerCase()} {h.cueDetail}
                        </p>
                      )}
                    </div>
                    <button onClick={() => setHabits((cur) => cur.filter((_, j) => j !== i))} style={{
                      background: "none", border: "none", cursor: "pointer", color: C.faint, fontSize: 11,
                    }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <button onClick={finish} disabled={!habits.length} style={{
            ...styles.cta, marginTop: 18,
            opacity: habits.length ? 1 : 0.45, cursor: habits.length ? "pointer" : "default",
          }}>
            <Sparkles size={17} /> Start
          </button>
          <button onClick={() => setStep(0)} style={{ ...styles.linkBtn, margin: "12px auto 0", color: C.muted }}>
            Back to the identity
          </button>
        </>
      )}
    </div>
  );
}

/** A small prompt on Today for someone who hasn't set an identity yet. */
export function OnboardingPrompt({ onStart, onDismiss }) {
  return (
    <div style={{
      ...styles.card, marginBottom: 12,
      borderColor: alpha(C.gold, 0.28),
      background: `linear-gradient(135deg, ${alpha(C.gold, 0.08)}, ${C.surface})`,
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Target size={16} color={C.gold} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>
            Start with who, not what
          </p>
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, margin: "5px 0 0" }}>
            Two minutes: name the person you're becoming, then pick one habit as the evidence.
          </p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
        <button onClick={onStart} style={{ ...styles.linkBtn, color: C.gold }}>
          <ArrowRight size={12} /> Set it up
        </button>
        <button onClick={onDismiss} style={{ ...styles.linkBtn, color: C.faint, marginLeft: "auto" }}>
          Not now
        </button>
      </div>
    </div>
  );
}
