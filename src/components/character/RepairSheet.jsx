import React, { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { C, F, alpha, styles } from "../../theme.js";
import { REPAIR_STYLES, reactionLabel, repairDraft, tomorrowMorning } from "../../lib/temper.js";
import { Pill, Sheet } from "../ui.jsx";

const TONE = C.green;

/** After a bad moment: what now? A draft to start from, in your own words in the end, and a promise to come back to it. */
export default function RepairSheet({ entry, onClose, onSet }) {
  const [style, setStyle] = useState("sorry");
  const [text, setText] = useState(() => repairDraft(entry, "sorry"));
  const [copied, setCopied] = useState(false);
  const pick = (id) => { setStyle(id); setText(repairDraft(entry, id)); setCopied(false); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* the text is still there to select */ }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <Sheet open onClose={onClose} title="Make it right">
      <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.6, margin: "-4px 0 12px" }}>
        {reactionLabel(entry.reaction)}{entry.who ? `, with ${entry.who}` : ""}. A short, honest message does more than a long one, and sooner does more than later.
      </p>
      <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
        {REPAIR_STYLES.map((s) => <Pill key={s.id} on={style === s.id} color={TONE} onClick={() => pick(s.id)}>{s.label}</Pill>)}
      </div>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setCopied(false); }} rows={5} aria-label="A message to send"
        style={{ ...styles.input, resize: "vertical", fontFamily: F.display, fontSize: 14.5, lineHeight: 1.6 }} />
      <p style={{ color: C.faint, fontSize: 11.5, margin: "6px 0 10px" }}>This is a starting point. Change it until it sounds like you.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={copy} style={{ ...styles.ghostCta, height: 42, flex: 1, fontSize: 13 }}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}</button>
        {canShare && <button onClick={() => navigator.share({ text }).catch(() => {})} style={{ ...styles.ghostCta, height: 42, flex: 1, fontSize: 13 }}><Share2 size={14} /> Send</button>}
      </div>
      <button onClick={() => onSet("done")} style={{ ...styles.cta, height: 46, fontSize: 14, marginTop: 14, background: `linear-gradient(135deg, ${TONE}, ${alpha(TONE, 0.72)})` }}>
        <Check size={16} /> I've done it
      </button>
      <button onClick={() => onSet("open", { remindAt: tomorrowMorning() })} style={{ ...styles.ghostCta, height: 42, fontSize: 13, marginTop: 8 }}>Remind me tomorrow morning</button>
      <button onClick={() => onSet("skipped")} style={{ ...styles.linkBtn, margin: "12px auto 0", color: C.faint }}>Nothing needs making right</button>
    </Sheet>
  );
}
