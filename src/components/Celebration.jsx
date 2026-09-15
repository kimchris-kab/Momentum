import React, { useEffect, useMemo } from "react";
import { Gift, Trophy } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";

// Fires when a habit crosses 7 / 21 / 30 / 66 / 100 / 365 days. The immediate, slightly
// over-the-top payoff is the point: habits need a reward closer than "someday I'll be fitter".
export default function Celebration({ event, onClose, onClaimReward }) {
  useEffect(() => {
    if (!event) return undefined;
    const t = setTimeout(onClose, 9000);
    return () => clearTimeout(t);
  }, [event, onClose]);

  const bits = useMemo(
    () => Array.from({ length: 22 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.7,
      dur: 2.2 + Math.random() * 1.4,
      size: 5 + Math.random() * 7,
      color: [C.gold, C.orange, C.purple, C.teal, C.green][i % 5],
    })), [event?.id]);

  if (!event) return null;

  return (
    <div onClick={onClose} className="mtm-backdrop" style={{
      position: "fixed", inset: 0, zIndex: 70, background: "rgba(8,7,13,0.78)",
      backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, overflow: "hidden",
    }}>
      {bits.map((b) => (
        <span key={b.id} className="mtm-confetti" style={{
          position: "absolute", top: -20, left: `${b.left}%`, width: b.size, height: b.size * 1.6,
          background: b.color, borderRadius: 2,
          ["--mtm-cdur"]: `${b.dur}s`, ["--mtm-cdelay"]: `${b.delay}s`,
        }} />
      ))}

      <div onClick={(e) => e.stopPropagation()} className="mtm-sheet" style={{
        background: C.bgElev, border: `1px solid ${alpha(C.gold, 0.35)}`, borderRadius: R.xl,
        padding: "28px 24px", textAlign: "center", maxWidth: 340, width: "100%",
        boxShadow: `0 24px 60px -20px ${alpha(C.gold, 0.5)}`,
      }}>
        <div style={{
          width: 62, height: 62, borderRadius: 20, margin: "0 auto 16px",
          background: `linear-gradient(140deg, ${C.gold}, ${C.orange})`, color: "#14131f",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Trophy size={29} />
        </div>

        <p style={{ color: C.gold, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", margin: 0 }}>
          {event.days}-day milestone
        </p>
        <h2 style={{ ...styles.h2, fontSize: 24, margin: "8px 0 10px" }}>{event.title}</h2>
        <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{event.message}</p>

        {event.reward && (
          <div style={{
            marginTop: 18, padding: "14px 15px", borderRadius: R.md,
            background: C.goldSoft, border: `1px solid ${alpha(C.gold, 0.3)}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, justifyContent: "center" }}>
              <Gift size={15} color={C.gold} />
              <span style={{ color: C.text, fontSize: 13.5, fontWeight: 600 }}>{event.reward.text}</span>
            </div>
            <button onClick={() => { onClaimReward(event.taskId); onClose(); }} style={{
              ...styles.cta, height: 42, marginTop: 12, fontSize: 13.5,
            }}>
              Claim it — you earned this
            </button>
          </div>
        )}

        <button onClick={onClose} style={{ ...styles.linkBtn, margin: "18px auto 0" }}>
          Keep going
        </button>
      </div>
    </div>
  );
}
