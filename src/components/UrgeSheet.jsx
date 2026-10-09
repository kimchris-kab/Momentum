import React, { Suspense, lazy, useMemo, useState } from "react";
import { Check, Feather, Repeat, RotateCcw, Waves } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import {
  CALM_PROMPT_BY_ID, FEELINGS, URGE_MINUTES, URGE_PRESETS, calmNoteParts, knownTriggers, promptAfter,
} from "../lib/urges.js";
import { TimerRing, useTimer } from "./Timer.jsx";
import { Pill, Sheet } from "./ui.jsx";
import LetterReader from "./character/LetterReader.jsx";

// The breathing pacer is the biggest thing on this screen and the part least often wanted, so it
// loads when the urge screen does rather than with the app.
const BreathPacer = lazy(() => import("./BreathPacer.jsx"));

// The break side's working surface. Three steps, and which one opens depends on how you got
// here: "urge" to ride one out, "lapse" to record a slip. Both end on the same question —
// one part of the note from calm you, asked at the moment it can be answered honestly.
//
// Calm colours on purpose. The rest of the break side is red, which is right for a list of
// things to avoid and wrong for the screen someone opens at their weakest moment.
const CALM = C.teal;
const INSTEAD = C.green;

const fieldLabel = { color: C.text, fontSize: 12.5, fontWeight: 600, margin: "0 0 8px" };

export default function UrgeSheet({ open, task, mode = "urge", ...rest }) {
  if (!open || !task) return null;
  // Keyed so reopening always starts fresh — a half-finished lapse form from an hour ago is
  // the last thing to show someone in the next urge.
  return <UrgeBody key={`${task.id}:${mode}`} task={task} mode={mode} {...rest} />;
}

function UrgeBody({ task, mode, urgeLog, surf, onSurf, letters = [], onReadLetter, onLogUrge, onLogLapse, onSaveNote, onClose }) {
  const [step, setStep] = useState(mode === "lapse" ? "lapse" : "urge");
  const [ask, setAsk] = useState(null);

  const toWrite = (event) => {
    setAsk(promptAfter(event));
    setStep("write");
  };

  const title = step === "urge" ? "Ride it out" : step === "lapse" ? "What happened" : "For next time";

  return (
    <Sheet open onClose={onClose} title={title}>
      {step === "urge" && (
        <RideItOut
          task={task} surf={surf} onSurf={onSurf} letters={letters} onReadLetter={onReadLetter}
          onPassed={(seconds) => { onLogUrge({ task, seconds, outcome: "rode-out" }); toWrite("rodeOut"); }}
          onGaveIn={(seconds) => { onLogUrge({ task, seconds, outcome: "gave-in" }); setStep("lapse"); }}
        />
      )}
      {step === "lapse" && (
        <Lapse
          task={task} urgeLog={urgeLog}
          onSave={(entry) => { onLogLapse({ task, ...entry }); toWrite("lapse"); }}
        />
      )}
      {step === "write" && ask && (
        <WriteNote
          task={task} prompt={ask}
          onSave={(text) => { onSaveNote(task, ask.id, text); onClose(); }}
          onSkip={onClose}
        />
      )}
    </Sheet>
  );
}

// ---- 1. The note, then the plan, then the clock ----
function RideItOut({ task, surf, onSurf, letters = [], onReadLetter, onPassed, onGaveIn }) {
  const [minutes, setMinutes] = useState(URGE_MINUTES);
  const total = minutes * 60;
  const timer = useTimer({ totalSecs: total, resetKey: minutes, autoStart: true });
  const note = calmNoteParts(task);
  const instead = (task.competingResponse || "").trim();

  return (
    <>
      <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.6, margin: "-4px 0 14px" }}>
        {task.text}. It rises, peaks and falls — you don't have to do anything with it except wait.
      </p>

      {/* The note comes first: it is the reasoning this moment can't reach on its own. */}
      {note.length > 0 ? <Letter parts={note} /> : (
        <p style={{
          color: C.faint, fontSize: 12, lineHeight: 1.55, margin: "0 0 12px",
          padding: "11px 13px", borderRadius: R.md, border: `1px dashed ${C.borderStrong}`,
        }}>
          No note from calm you yet. Once this passes, the app will ask you to write one — for
          exactly this moment, next time.
        </p>
      )}

      {/* Written for exactly this moment, and kept sealed until it comes. */}
      {letters.length > 0 && <LetterReader letter={letters[0]} onOpen={onReadLetter} tone={CALM} />}

      {instead && (
        <div style={{
          display: "flex", gap: 10, alignItems: "flex-start", margin: "0 0 16px",
          background: alpha(INSTEAD, 0.08), border: `1px solid ${alpha(INSTEAD, 0.25)}`,
          borderRadius: R.md, padding: "11px 13px",
        }}>
          <Repeat size={15} color={INSTEAD} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ color: INSTEAD, fontSize: 10.5, fontWeight: 650, letterSpacing: 0.4, margin: 0, textTransform: "uppercase" }}>
              Instead, I will
            </p>
            <p style={{ color: C.text, fontSize: 14, lineHeight: 1.5, margin: "3px 0 0" }}>{instead}</p>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        {URGE_PRESETS.map((m) => (
          <Pill key={m} on={minutes === m} color={CALM} onClick={() => setMinutes(m)}>{m} min</Pill>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <TimerRing elapsed={timer.elapsed} total={total} running={timer.running} color={CALM} size={140} />
        <p style={{ color: C.faint, fontSize: 11.5, margin: 0, textAlign: "center" }}>
          {timer.finished
            ? "The clock's done. If it's still there, it's weaker than it was — go again or call it."
            : "Most urges are gone well before this reaches zero."}
        </p>
        {timer.finished && (
          <button onClick={timer.reset} style={{ ...styles.linkBtn, color: CALM, fontSize: 12.5 }}>
            <RotateCcw size={12} /> Go again
          </button>
        )}
      </div>

      {/* Something to do with the minutes, which is most of what makes them pass. */}
      {surf && onSurf && (
        <Suspense fallback={null}>
          <BreathPacer surf={surf} onSurf={onSurf} />
        </Suspense>
      )}

      <button onClick={() => onPassed(timer.elapsed)} style={{
        ...styles.cta, background: `linear-gradient(135deg, ${CALM}, ${alpha(CALM, 0.72)})`,
      }}>
        <Check size={18} /> It passed
      </button>
      {/* Deliberately quiet and deliberately honest: giving in is recorded, not punished. */}
      <button onClick={() => onGaveIn(timer.elapsed)} style={{ ...styles.linkBtn, margin: "14px auto 0", color: C.muted }}>
        I gave in
      </button>
    </>
  );
}

function Letter({ parts }) {
  return (
    <div style={{
      margin: "0 0 12px", padding: "14px 15px 6px", borderRadius: R.md,
      background: alpha(CALM, 0.07), border: `1px solid ${alpha(CALM, 0.24)}`,
    }}>
      <p style={{ display: "flex", alignItems: "center", gap: 6, color: CALM, fontSize: 10.5, fontWeight: 650, letterSpacing: 0.4, margin: "0 0 10px", textTransform: "uppercase" }}>
        <Feather size={12} /> From calm you
      </p>
      {parts.map((p) => (
        <div key={p.id} style={{ marginBottom: 10 }}>
          <p style={{ color: C.faint, fontSize: 11, margin: "0 0 2px" }}>{p.label}</p>
          <p style={{ color: C.text, fontFamily: F.display, fontSize: 16, lineHeight: 1.45, margin: 0, whiteSpace: "pre-wrap" }}>
            {p.text}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---- 2. A slip, recorded at the moment ----
function Lapse({ task, urgeLog, onSave }) {
  const triggers = useMemo(() => knownTriggers(urgeLog, task), [urgeLog, task]);
  const [trigger, setTrigger] = useState("");
  const [feeling, setFeeling] = useState(null);
  const [place, setPlace] = useState("");

  return (
    <>
      {/* The abstinence violation effect: the slip that becomes a relapse is the one that's
          read as proof it was never going to work. So the first thing said is that it isn't. */}
      <p style={{ color: C.text, fontFamily: F.display, fontSize: 18, lineHeight: 1.35, margin: "-4px 0 4px" }}>
        That's a lapse, not a relapse.
      </p>
      <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.6, margin: "0 0 16px" }}>
        One slip is information. What was going on is worth more written down now than
        remembered later — this is how the app learns when {task.text.toLowerCase()} actually happens.
      </p>

      <p style={fieldLabel}>What set it off?</p>
      {triggers.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {triggers.map((tr) => (
            <Pill key={tr} on={trigger === tr} color={C.orange} onClick={() => setTrigger(trigger === tr ? "" : tr)}>
              {tr}
            </Pill>
          ))}
        </div>
      )}
      <div style={{ ...styles.fieldShell, marginBottom: 14 }}>
        <input value={trigger} onChange={(e) => setTrigger(e.target.value)} aria-label="What set it off"
          placeholder={triggers.length ? "Or something else" : "e.g. waiting for the bus"}
          style={{ ...styles.bareInput, flex: 1 }} />
      </div>

      <p style={fieldLabel}>How were you feeling?</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {FEELINGS.map((f) => (
          <Pill key={f.id} on={feeling === f.id} color={C.purple} onClick={() => setFeeling(feeling === f.id ? null : f.id)}>
            {f.label}
          </Pill>
        ))}
      </div>

      <p style={fieldLabel}>Where were you? <span style={{ color: C.faint, fontWeight: 400 }}>optional</span></p>
      <div style={{ ...styles.fieldShell, marginBottom: 18 }}>
        <input value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Where were you"
          placeholder="e.g. in bed" style={{ ...styles.bareInput, flex: 1 }} />
      </div>

      <button onClick={() => onSave({ trigger, feeling, place })} style={styles.cta}>
        <Check size={18} /> Record it
      </button>
    </>
  );
}

// ---- 3. One part of the note, asked when it can be answered honestly ----
function WriteNote({ task, prompt, onSave, onSkip }) {
  const [text, setText] = useState(task.calmNote?.[prompt.id] || "");
  const afterLapse = prompt.id === "after";

  return (
    <>
      <p style={{ display: "flex", alignItems: "center", gap: 7, color: CALM, fontSize: 13, fontWeight: 650, margin: "-4px 0 6px" }}>
        {afterLapse ? <Feather size={14} /> : <Waves size={14} />}
        {afterLapse ? "Before you close this" : "You rode it out."}
      </p>
      <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.6, margin: "0 0 14px" }}>
        {afterLapse
          ? "Right now is the one time you know how it feels an hour after, rather than guessing. Write it to the you who's about to give in next time — they'll read it first."
          : "That's the one that counts. While it's fresh: what got you through? You'll read this the next time one hits."}
      </p>

      <p style={{ ...fieldLabel, color: CALM }}>{CALM_PROMPT_BY_ID[prompt.id].label}</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label={prompt.label}
        placeholder={prompt.placeholder}
        style={{ ...styles.input, width: "100%", resize: "vertical", fontFamily: F.display, fontSize: 15, lineHeight: 1.45, marginBottom: 14 }} />

      <button onClick={() => onSave(text)} disabled={!text.trim()} style={{
        ...styles.cta, opacity: text.trim() ? 1 : 0.5,
        background: `linear-gradient(135deg, ${CALM}, ${alpha(CALM, 0.72)})`,
      }}>
        <Feather size={16} /> Keep it for next time
      </button>
      <button onClick={onSkip} style={{ ...styles.linkBtn, margin: "14px auto 0", color: C.muted }}>
        Not now
      </button>
    </>
  );
}
