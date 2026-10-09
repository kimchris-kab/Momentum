import React, { useMemo, useState } from "react";
import { Check, Moon } from "lucide-react";
import { C, F, R, alpha, styles } from "../../theme.js";
import { addDays, prettyDate, todayStr } from "../../lib/date.js";
import { QUESTIONS, examenFor, examenStats, todayPrompt } from "../../lib/examen.js";
import { isCalm, reactionLabel } from "../../lib/temper.js";
import { Card, SectionLabel } from "../ui.jsx";

const TONE = C.purple;
const LABELS = { isCalm, reaction: reactionLabel };

/** The evening examen: three questions, a minute, once a night. Last night's promise is put in front of tonight's answers. */
export default function ExamenTab({ state, onSave }) {
  const today = todayStr();
  const mine = examenFor(state, today);
  const [form, setForm] = useState({ well: mine?.well || "", short: mine?.short || "", tomorrow: mine?.tomorrow || "" });
  const [saved, setSaved] = useState(!!mine);
  const promise = examenFor(state, addDays(today, -1))?.tomorrow || "";
  const prompt = useMemo(() => todayPrompt(state, today, LABELS), [state.temperLog]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = examenStats(state, today);
  const past = useMemo(() => [...(state.examenLog || [])].filter((e) => e.date !== today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6), [state.examenLog, today]);
  const any = Object.values(form).some((v) => v.trim());

  return (
    <>
      <Card style={{ borderColor: alpha(TONE, 0.32) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Moon size={15} color={TONE} />
          <span style={{ color: TONE, fontSize: 11, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase", flex: 1 }}>Tonight's examen</span>
          <span style={{ color: C.faint, fontSize: 11.5 }}>{st.nights} of 7 nights{st.streak > 1 ? ` · ${st.streak} in a row` : ""}</span>
        </div>
        {promise && (
          <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.6, margin: "11px 0 0", padding: "9px 11px", borderRadius: R.md, background: alpha(TONE, 0.08) }}>
            Last night you said you would: <span style={{ color: C.text }}>{promise}</span>
          </p>
        )}
        {QUESTIONS.map((q) => (
          <div key={q.id} style={{ marginTop: 14 }}>
            <p style={{ color: C.text, fontSize: 13.5, fontWeight: 650, margin: "0 0 3px" }}>{q.label}</p>
            {q.id === "short" && prompt && <p style={{ color: C.muted, fontSize: 11.5, margin: "0 0 6px" }}>{prompt}</p>}
            <textarea value={form[q.id]} onChange={(e) => { setForm({ ...form, [q.id]: e.target.value }); setSaved(false); }}
              rows={2} maxLength={400} aria-label={q.label} placeholder={q.placeholder}
              style={{ ...styles.input, resize: "vertical", fontFamily: F.display, fontSize: 14, lineHeight: 1.45 }} />
          </div>
        ))}
        <button onClick={() => { onSave({ date: today, ...form }); setSaved(true); }} disabled={!any || saved}
          style={{ ...styles.cta, height: 46, fontSize: 14, marginTop: 16, opacity: any && !saved ? 1 : 0.55 }}>
          {saved ? <><Check size={16} /> Saved for tonight</> : "Save tonight"}
        </button>
      </Card>

      {past.length > 0 && (
        <>
          <SectionLabel>Earlier nights</SectionLabel>
          {past.map((e) => (
            <Card key={e.id} style={{ padding: 13 }}>
              <p style={{ color: C.faint, fontSize: 11, fontWeight: 650, letterSpacing: 0.4, textTransform: "uppercase", margin: "0 0 6px" }}>{prettyDate(e.date)}</p>
              {QUESTIONS.filter((q) => e[q.id]).map((q) => (
                <p key={q.id} style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: "0 0 4px" }}>
                  <span style={{ color: C.faint }}>{q.id === "well" ? "Well: " : q.id === "short" ? "Short: " : "Tomorrow: "}</span>{e[q.id]}
                </p>
              ))}
            </Card>
          ))}
        </>
      )}
    </>
  );
}
