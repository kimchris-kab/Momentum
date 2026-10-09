import React, { useMemo, useState } from "react";
import { Mail, Plus, Trash2 } from "lucide-react";
import { C, F, alpha, styles } from "../../theme.js";
import { DELAYS, MAX_LETTER, WHEN, dueLetters, newLetter, waitingFor } from "../../lib/letters.js";
import { quits } from "../../lib/pep.js";
import { Card, EmptyState, Pill, SectionLabel, Sheet } from "../ui.jsx";
import LetterReader from "./LetterReader.jsx";

const TONE = C.gold;
const KINDS = [
  { id: "later", label: "To open later" },
  { id: "milestone", label: "On a milestone" },
  { id: "when", label: "For a hard moment" },
];
const MILESTONE_DAYS = [7, 14, 30, 60, 90, 180];

/** Letters to yourself: written now, delivered when they're needed. */
export default function LettersTab({ state, initialOpen, onAdd, onOpen, onRemove }) {
  const [writing, setWriting] = useState(false);
  const letters = state.letters || [];
  const ready = useMemo(() => new Set(dueLetters(state).map((l) => l.id)), [state.letters, state.tasks, state.urgeLog]); // eslint-disable-line react-hooks/exhaustive-deps
  const arrived = letters.filter((l) => ready.has(l.id) || (l.openedAt && l.kind !== "when"));
  const kept = letters.filter((l) => l.kind === "when");
  const waiting = letters.filter((l) => !ready.has(l.id) && !l.openedAt && l.kind !== "when");

  return (
    <>
      <Card style={{ borderColor: alpha(TONE, 0.32) }}>
        <p style={{ color: C.text, fontSize: 14, fontWeight: 650, margin: 0 }}>Letters to yourself</p>
        <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: "5px 0 13px" }}>
          Write now, in your own words. It arrives when you'll need it: on a date, on day 30 of a habit you're quitting, or at the moment you want to give in.
        </p>
        <button onClick={() => setWriting(true)} style={{ ...styles.cta, height: 44, fontSize: 13.5 }}><Plus size={15} /> Write a letter</button>
      </Card>

      {arrived.length > 0 && (
        <>
          <SectionLabel>Arrived</SectionLabel>
          {arrived.map((l) => <LetterReader key={`${l.id}:${l.openedAt || 0}`} letter={l} onOpen={onOpen} startOpen={!!l.openedAt || l.id === initialOpen} />)}
        </>
      )}

      {kept.length > 0 && (
        <>
          <SectionLabel>Kept for hard moments</SectionLabel>
          {kept.map((l) => (
            <div key={l.id}>
              <p style={{ color: C.faint, fontSize: 11.5, margin: "0 0 5px" }}>{waitingFor(state, l)}{l.opens ? ` · read ${l.opens} time${l.opens === 1 ? "" : "s"}` : ""}</p>
              <LetterReader letter={l} onOpen={onOpen} startOpen={l.id === initialOpen} />
              <button onClick={() => onRemove(l.id)} aria-label="Delete this letter" style={{ ...styles.linkBtn, color: C.faint, margin: "-4px 0 10px", fontSize: 11.5 }}><Trash2 size={11} /> Delete</button>
            </div>
          ))}
        </>
      )}

      {waiting.length > 0 && (
        <>
          <SectionLabel>On their way</SectionLabel>
          {waiting.map((l) => (
            <Card key={l.id} style={{ padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Mail size={15} color={C.faint} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>{l.title || "A letter to yourself"}</p>
                  <p style={{ color: C.muted, fontSize: 11.5, margin: "2px 0 0" }}>{waitingFor(state, l)}. Sealed.</p>
                </div>
                <button onClick={() => onRemove(l.id)} aria-label="Delete this letter" title="Delete" style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", padding: 4 }}><Trash2 size={14} /></button>
              </div>
            </Card>
          ))}
        </>
      )}

      {letters.length === 0 && <EmptyState Icon={Mail} title="No letters yet" hint="The first one is the best one to write on a good day, for a bad one." />}

      <WriteSheet open={writing} state={state} onClose={() => setWriting(false)} onSave={(l) => { onAdd(l); setWriting(false); }} />
    </>
  );
}

function WriteSheet({ open, state, onClose, onSave }) {
  const habits = quits(state.tasks);
  const [kind, setKind] = useState("later");
  const [delay, setDelay] = useState(30);
  const [taskId, setTaskId] = useState(null);
  const [day, setDay] = useState(30);
  const [when, setWhen] = useState("urge");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const chosenTask = taskId || habits[0]?.id || null;
  const letter = newLetter({ body, title, kind, delayDays: delay, taskId: chosenTask, day, when });
  const small = { color: C.muted, fontSize: 11.5, fontWeight: 600, margin: "14px 0 7px" };

  return (
    <Sheet open={open} onClose={onClose} title="Write a letter">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {KINDS.filter((k) => k.id !== "milestone" || habits.length).map((k) => <Pill key={k.id} on={kind === k.id} color={TONE} onClick={() => setKind(k.id)}>{k.label}</Pill>)}
      </div>
      {kind === "later" && (
        <>
          <p style={small}>Arrives</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {DELAYS.map((d) => <Pill key={d.id} on={delay === d.days} color={TONE} onClick={() => setDelay(d.days)}>{d.label}</Pill>)}
          </div>
        </>
      )}
      {kind === "milestone" && (
        <>
          <p style={small}>Habit you're quitting</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {habits.map((t) => <Pill key={t.id} on={chosenTask === t.id} color={TONE} onClick={() => setTaskId(t.id)}>{t.text}</Pill>)}
          </div>
          <p style={small}>Arrives on day</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {MILESTONE_DAYS.map((d) => <Pill key={d} on={day === d} color={TONE} onClick={() => setDay(d)}>{d}</Pill>)}
          </div>
        </>
      )}
      {kind === "when" && (
        <>
          <p style={small}>Open it</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {WHEN.map((w) => <Pill key={w.id} on={when === w.id} color={TONE} onClick={() => setWhen(w.id)}>{w.label}</Pill>)}
          </div>
          <p style={{ color: C.faint, fontSize: 11.5, margin: "8px 0 0" }}>{WHEN.find((w) => w.id === when)?.hint}</p>
        </>
      )}
      <p style={small}>A title (optional)</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} aria-label="Letter title" placeholder="e.g. Read this when it's hard" style={styles.input} />
      <p style={small}>Your letter</p>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX_LETTER} rows={7} aria-label="Your letter"
        placeholder="Write as if to someone you love who is having a hard time. Say what you know now that they'll have forgotten."
        style={{ ...styles.input, resize: "vertical", fontFamily: F.display, fontSize: 14.5, lineHeight: 1.6 }} />
      <button onClick={() => { if (!letter) return; onSave(letter); setBody(""); setTitle(""); }} disabled={!letter}
        style={{ ...styles.cta, height: 46, fontSize: 14, marginTop: 16, opacity: letter ? 1 : 0.5 }}>
        <Mail size={15} /> Seal it
      </button>
    </Sheet>
  );
}
