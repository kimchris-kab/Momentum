import React, { useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import {
  BLOCKERS, ENERGIZERS, FEEL_LEVELS, PILLARS, PILLAR_LEVELS, RECHARGE_LEVELS,
} from "../data/constants.js";
import { longDate, todayStr } from "../lib/date.js";
import { Card } from "../components/ui.jsx";

const STEPS = ["feel", "pillars", "energizers", "blockers", "reflect", "recharge", "summary"];

export default function CheckinView({ existing, onSave, onBack }) {
  const [step, setStep] = useState(0);
  const [feel, setFeel] = useState(existing?.feel ?? 3);
  const [scores, setScores] = useState(() => {
    const s = {};
    PILLARS.forEach((p) => (s[p.id] = existing?.scores?.[p.id] ?? 3));
    return s;
  });
  const [energizers, setEnergizers] = useState(existing?.energizers ?? []);
  const [blockers, setBlockers] = useState(existing?.blockers ?? []);
  const [note, setNote] = useState(existing?.note ?? "");
  const [deed, setDeed] = useState(existing?.deed ?? "");
  const [recharge, setRecharge] = useState(existing?.recharge ?? 3);

  const toggleIn = (setter) => (id) =>
    setter((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const stepId = STEPS[step];
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => (step === 0 ? onBack() : setStep((s) => s - 1));
  const save = () => onSave({
    date: todayStr(), scores, note: note.trim(), deed: deed.trim(), feel, energizers, blockers, recharge,
  });

  const vals = Object.values(scores);
  const avgScore = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

  return (
    <div style={styles.page}>
      <button onClick={back} style={styles.back}>
        <ChevronLeft size={18} /> {step === 0 ? "Back" : "Previous"}
      </button>

      <div style={{ display: "flex", gap: 5, marginBottom: 22 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i <= step ? C.gold : C.border,
            transition: "background .3s ease",
          }} />
        ))}
      </div>

      {stepId === "feel" && (
        <div>
          <p style={styles.eyebrow}>Feel good, then do good work</p>
          <h1 style={styles.h1}>How do you feel right now?</h1>
          <p style={styles.lede}>
            Feel Good Productivity starts here — your energy drives your output, not the other way around.
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
            {FEEL_LEVELS.map((f) => (
              <ChoiceTile key={f.v} on={feel === f.v} onClick={() => setFeel(f.v)}
                emoji={f.emoji} label={f.label} color={C.gold} />
            ))}
          </div>
        </div>
      )}

      {stepId === "pillars" && (
        <div>
          <p style={styles.eyebrow}>{longDate(todayStr())}</p>
          <h1 style={styles.h1}>Rate your day</h1>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {PILLARS.map((p) => (
              <div key={p.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
                  <p.Icon size={16} color={p.color} />
                  <span style={{ color: C.text, fontSize: 14.5, fontWeight: 550 }}>{p.name}</span>
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const on = scores[p.id] === n;
                    return (
                      <button key={n} onClick={() => setScores((s) => ({ ...s, [p.id]: n }))} style={{
                        flex: 1, height: 42, borderRadius: 11, cursor: "pointer", fontWeight: 600, fontSize: 15,
                        fontFamily: F.body, transition: "all .14s ease",
                        border: `1px solid ${on ? p.color : C.border}`,
                        background: on ? p.color : "transparent",
                        color: on ? "#14131f" : C.muted,
                      }}>{n}</button>
                    );
                  })}
                </div>
                <p style={{ color: C.faint, fontSize: 11.5, marginTop: 7 }}>{p.prompt}</p>
                <p style={{ color: p.color, fontSize: 12, marginTop: 6, lineHeight: 1.5, fontStyle: "italic" }}>
                  {PILLAR_LEVELS[p.id][scores[p.id] - 1]}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {stepId === "energizers" && (
        <div>
          <p style={styles.eyebrow}>Energize</p>
          <h1 style={styles.h1}>What gave you energy?</h1>
          <p style={styles.lede}>Pick as many as fit. These three are the book's core fuel sources.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ENERGIZERS.map((e) => (
              <OptionRow key={e.id} on={energizers.includes(e.id)} onClick={() => toggleIn(setEnergizers)(e.id)}
                Icon={e.Icon} color={e.color} label={e.label} desc={e.desc} />
            ))}
          </div>
        </div>
      )}

      {stepId === "blockers" && (
        <div>
          <p style={styles.eyebrow}>Unblock</p>
          <h1 style={styles.h1}>What held you back?</h1>
          <p style={styles.lede}>The book calls these your Kryptonite. Naming it is most of the fix.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {BLOCKERS.map((b) => (
              <div key={b.id}>
                <OptionRow on={blockers.includes(b.id)} onClick={() => toggleIn(setBlockers)(b.id)}
                  Icon={b.Icon} color={b.color} label={b.label} />
                {blockers.includes(b.id) && (
                  <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, margin: "8px 4px 0", fontStyle: "italic" }}>
                    💡 {b.tip}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {stepId === "reflect" && (
        <div>
          <p style={styles.eyebrow}>Journal</p>
          <h1 style={styles.h1}>A quick reflection</h1>
          <p style={styles.sectionLabel}>A good deed today</p>
          <input value={deed} onChange={(e) => setDeed(e.target.value)}
            placeholder="Something kind or right you did…" style={styles.input} />
          <p style={styles.sectionLabel}>Reflection</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5}
            placeholder="What moved you forward? What held you back?"
            style={{ ...styles.input, resize: "none", lineHeight: 1.6 }} />
        </div>
      )}

      {stepId === "recharge" && (
        <div>
          <p style={styles.eyebrow}>Sustain</p>
          <h1 style={styles.h1}>How recharged do you feel?</h1>
          <p style={styles.lede}>Burnout builds quietly. Checking in on this protects tomorrow's energy.</p>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
            {RECHARGE_LEVELS.map((r) => (
              <ChoiceTile key={r.v} on={recharge === r.v} onClick={() => setRecharge(r.v)}
                emoji={r.emoji} label={r.label} color={C.teal} small />
            ))}
          </div>
        </div>
      )}

      {stepId === "summary" && (
        <div>
          <p style={styles.eyebrow}>{longDate(todayStr())}</p>
          <h1 style={styles.h1}>Today, in short</h1>
          <Card style={{
            background: `linear-gradient(135deg, ${alpha(C.gold, 0.1)}, ${C.surface})`,
            borderColor: alpha(C.gold, 0.22), padding: 18,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", marginBottom: 16 }}>
              <SummaryBit big={FEEL_LEVELS.find((f) => f.v === feel)?.emoji}
                label={`Felt ${FEEL_LEVELS.find((f) => f.v === feel)?.label.toLowerCase()}`} />
              <SummaryBit value={avgScore.toFixed(1)} label="Avg balance" />
              <SummaryBit big={RECHARGE_LEVELS.find((r) => r.v === recharge)?.emoji} label="Ending recharged" />
            </div>
            <div style={{ borderTop: `1px solid ${alpha(C.gold, 0.2)}`, paddingTop: 13 }}>
              <p style={{ color: C.text, fontSize: 13, lineHeight: 1.65, margin: 0 }}>
                {energizers.length > 0 ? (
                  <>Fueled by <b style={{ color: C.gold }}>
                    {energizers.map((id) => ENERGIZERS.find((e) => e.id === id).label).join(" + ")}</b>.</>
                ) : "No particular energizer today."}
                {" "}
                {blockers.length > 0 ? (
                  <>Held back by <b style={{ color: C.red }}>
                    {blockers.map((id) => BLOCKERS.find((b) => b.id === id).label).join(" + ")}</b>.</>
                ) : "Nothing blocking you today 🎉"}
              </p>
            </div>
          </Card>
          <button onClick={save} className="mtm-shimmer" style={{
            ...styles.cta, marginTop: 8,
            background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`,
          }}>
            <Check size={18} /> Save today
          </button>
        </div>
      )}

      {stepId !== "summary" && (
        <button onClick={next} style={{ ...styles.cta, marginTop: 26 }}>
          Continue <ChevronRight size={17} />
        </button>
      )}
    </div>
  );
}

function ChoiceTile({ on, onClick, emoji, label, color, small }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      padding: "16px 4px", borderRadius: R.md, cursor: "pointer",
      border: `1.5px solid ${on ? color : C.border}`,
      background: on ? alpha(color, 0.13) : C.surface,
      transition: "all .16s ease",
    }}>
      <span style={{ fontSize: small ? 23 : 26 }}>{emoji}</span>
      <span style={{
        color: on ? color : C.muted, fontSize: small ? 8.5 : 9.5, fontWeight: 600,
        textAlign: "center", lineHeight: 1.25, fontFamily: F.body,
      }}>{label}</span>
    </button>
  );
}

function OptionRow({ on, onClick, Icon, color, label, desc }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "14px 15px",
      borderRadius: R.md, cursor: "pointer", textAlign: "left",
      border: `1.5px solid ${on ? color : C.border}`,
      background: on ? alpha(color, 0.1) : C.surface,
      transition: "all .16s ease",
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12, background: alpha(color, 0.14), color,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={19} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ color: on ? color : C.text, fontSize: 14.5, fontWeight: 600, margin: 0 }}>{label}</p>
        {desc && <p style={{ color: C.muted, fontSize: 12, margin: "2px 0 0", lineHeight: 1.45 }}>{desc}</p>}
      </div>
      {on && <Check size={18} color={color} />}
    </button>
  );
}

function SummaryBit({ big, value, label }) {
  return (
    <div style={{ textAlign: "center" }}>
      {big
        ? <div style={{ fontSize: 30 }}>{big}</div>
        : <div style={{ color: C.gold, fontSize: 26, fontFamily: F.display, fontWeight: 600 }}>{value}</div>}
      <p style={{ color: C.muted, fontSize: 10, margin: "4px 0 0" }}>{label}</p>
    </div>
  );
}
