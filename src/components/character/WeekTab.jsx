import React, { useMemo, useState } from "react";
import { CalendarCheck, Check, Copy, Target } from "lucide-react";
import { C, F, alpha, styles } from "../../theme.js";
import { prettyDate, todayStr } from "../../lib/date.js";
import { reviewText, weekReport } from "../../lib/weekly.js";
import { Card, SectionLabel } from "../ui.jsx";

const TONE = C.teal;
const pct = (x) => (x === null ? "–" : `${Math.round(x * 100)}%`);

/** The last seven days, said once, ending on the one thing to carry into the next. */
export default function WeekTab({ state, onFocus, onSwitchVirtue }) {
  const today = todayStr();
  const r = useMemo(() => weekReport(state, today), [state.tasks, state.dayLog, state.urgeLog, state.virtue, state.virtueLog, state.examenLog, state.temperLog, state.letters, state.weekFocus]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = state.weekFocus?.[r.nextWeekStart] || "";
  const [focus, setFocus] = useState(chosen);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(reviewText(r, prettyDate)); setCopied(true); } catch { /* nothing to do */ }
  };

  return (
    <>
      <Card style={{ borderColor: alpha(TONE, 0.32) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CalendarCheck size={15} color={TONE} />
          <span style={{ color: TONE, fontSize: 11, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase" }}>Your week · {prettyDate(r.from)} to {prettyDate(r.to)}</span>
        </div>
        {r.highlights.length ? r.highlights.map((h) => (
          <p key={h} style={{ color: C.text, fontSize: 13.5, lineHeight: 1.6, margin: "10px 0 0" }}>{h}</p>
        )) : (
          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6, margin: "10px 0 0" }}>A quiet week. Reading this still counts. Below is one thing to try next.</p>
        )}
      </Card>

      <SectionLabel>The numbers</SectionLabel>
      <Card>
        <Row label="Habits" value={r.habits.total ? `${r.habits.done} of ${r.habits.total} · ${pct(r.habits.ratio)}` : "none planned"} />
        {r.quitting.map((q) => (
          <Row key={q.task.id} label={q.task.text} value={`${q.clean}d clean · ${q.slips} slip${q.slips === 1 ? "" : "s"} · ${q.rodeOut} urge${q.rodeOut === 1 ? "" : "s"} ridden out`} />
        ))}
        {r.virtue && <Row label={r.virtue.name} value={`${r.virtue.answered} answered · ${r.virtue.lived} fully lived`} />}
        <Row label="Evening examens" value={`${r.examen.nights} of 7 nights`} />
        <Row label="Temper" value={`${r.temper.thisWeek} lost, ${r.temper.calm} calm · last week ${r.temper.lastWeek}`} />
        {r.temper.owing > 0 && <Row label="Still to make right" value={`${r.temper.owing}${r.temper.owedTo ? `, starting with ${r.temper.owedTo}` : ""}`} />}
      </Card>

      <SectionLabel>One thing to work on</SectionLabel>
      <Card style={{ borderColor: alpha(C.gold, 0.35) }}>
        <p style={{ color: C.text, fontSize: 14, lineHeight: 1.65, margin: 0 }}>{r.suggestion.text}</p>
        {r.suggestion.kind === "virtue" && (
          <button onClick={() => onSwitchVirtue(r.suggestion.virtue)} style={{ ...styles.ghostCta, height: 40, fontSize: 13, marginTop: 11 }}>Start it</button>
        )}
      </Card>

      <SectionLabel>Next week's focus</SectionLabel>
      <Card>
        <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: "0 0 9px" }}>One sentence. Not a list: the one thing that, if it went well, would make the week a good one.</p>
        <textarea value={focus} onChange={(e) => setFocus(e.target.value)} rows={2} maxLength={140} aria-label="Next week's focus" placeholder="e.g. Phone charges in the kitchen, every night"
          style={{ ...styles.input, resize: "vertical", fontFamily: F.display, fontSize: 14.5, lineHeight: 1.45 }} />
        <button onClick={() => onFocus(r.nextWeekStart, focus)} disabled={!focus.trim() || focus.trim() === chosen}
          style={{ ...styles.cta, height: 44, fontSize: 13.5, marginTop: 10, opacity: focus.trim() && focus.trim() !== chosen ? 1 : 0.55 }}>
          {chosen && focus.trim() === chosen ? <><Check size={15} /> Set for next week</> : <><Target size={15} /> Set it</>}
        </button>
      </Card>
      <button onClick={copy} style={{ ...styles.linkBtn, margin: "6px auto 0", color: C.faint }}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy this week as text"}</button>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.muted, fontSize: 12.5 }}>{label}</span>
      <span style={{ color: C.text, fontSize: 12.5, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}
