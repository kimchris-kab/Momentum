import React, { useEffect, useState } from "react";
import { Mail, MailOpen } from "lucide-react";
import { C, F, R, alpha, styles } from "../../theme.js";
import { writtenAgo } from "../../lib/letters.js";

const TONE = C.gold;

/**
 * A letter you wrote, shown the way it was written: your words, nothing added. Sealed until you choose to open it,
 * because opening it is part of what it is for. `onOpen` records that it was read.
 */
export default function LetterReader({ letter, onOpen, startOpen = false, tone = TONE }) {
  const [shown, setShown] = useState(startOpen);
  const open = () => { setShown(true); onOpen?.(letter.id); };
  // Arriving by the notification or the card on Today is asking to read it, so it opens, and that counts as reading it.
  useEffect(() => { if (startOpen && !letter.openedAt) onOpen?.(letter.id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{
      margin: "0 0 12px", padding: 14, borderRadius: R.md,
      background: alpha(tone, 0.07), border: `1px solid ${alpha(tone, 0.28)}`,
    }}>
      <p style={{ display: "flex", alignItems: "center", gap: 6, color: tone, fontSize: 10.5, fontWeight: 650, letterSpacing: 0.4, margin: 0, textTransform: "uppercase" }}>
        {shown ? <MailOpen size={12} /> : <Mail size={12} />} A letter you wrote {writtenAgo(letter)}
      </p>
      {letter.title && <p style={{ color: C.text, fontSize: 14, fontWeight: 650, margin: "8px 0 0" }}>{letter.title}</p>}
      {shown ? (
        <p style={{ color: C.text, fontSize: 14.5, lineHeight: 1.7, margin: "9px 0 0", whiteSpace: "pre-wrap", fontFamily: F.display }}>{letter.body}</p>
      ) : (
        <button onClick={open} style={{ ...styles.ghostCta, height: 40, fontSize: 13, marginTop: 11 }}>
          <Mail size={14} /> Open it
        </button>
      )}
    </div>
  );
}
