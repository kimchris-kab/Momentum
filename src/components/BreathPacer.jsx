import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EyeOff, Vibrate, Waves } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { PATTERNS, PATTERN_BY_ID, phaseAt } from "../lib/pacer.js";
import { hapticsInfo, playBreath, stopBreath } from "../lib/haptics.js";
import { Pill } from "./ui.jsx";

const CALM = C.teal;
const SIZE = 168;

/**
 * The breathing pacer on the urge screen. A circle that fills and empties at the pace of the chosen
 * breath, and, on a phone with a motor, a vibration that rises and falls with it, so it can be
 * followed with the screen dark and the eyes closed — the state an urge makes hardest to look at a
 * phone in.
 *
 * Both are driven from one clock. The vibration is played once per breath, started when the breath
 * starts, so nothing accumulates and a stalled frame can't leave the two a few seconds apart.
 */
export default function BreathPacer({ surf, onSurf }) {
  const [on, setOn] = useState(surf.auto);
  const [eyes, setEyes] = useState(false);
  const [info, setInfo] = useState(null);
  const pattern = PATTERN_BY_ID[surf.pattern];

  useEffect(() => { hapticsInfo().then(setInfo); }, []);

  const buzz = surf.haptics && info?.motor !== false;

  return (
    <div role="group" aria-label="Breathing pacer" style={{
      margin: "0 0 16px", padding: "14px 15px", borderRadius: R.md,
      background: alpha(CALM, 0.06), border: `1px solid ${alpha(CALM, 0.22)}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Waves size={14} color={CALM} />
        <p style={{ color: CALM, fontSize: 10.5, fontWeight: 650, letterSpacing: 0.4, margin: 0, textTransform: "uppercase" }}>
          Breathe with me
        </p>
      </div>

      {!on ? (
        <>
          <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: "8px 0 12px" }}>
            Slow breathing is the quickest thing that brings an urge down. Follow the circle, or feel it
            in your hand with your eyes closed.
          </p>
          <button onClick={() => setOn(true)} style={{ ...styles.ghostCta, height: 42, fontSize: 13.5 }}>
            <Waves size={15} /> Start breathing
          </button>
        </>
      ) : (
        <Running
          key={pattern.id} pattern={pattern} buzz={buzz}
          onEyes={() => setEyes(true)} eyes={eyes} onOpen={() => setEyes(false)}
          onStop={() => { setOn(false); setEyes(false); }}
        />
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
        {PATTERNS.map((p) => (
          <Pill key={p.id} on={surf.pattern === p.id} color={CALM} onClick={() => onSurf({ ...surf, pattern: p.id })}>
            {p.label}
          </Pill>
        ))}
      </div>
      <p style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.5, margin: "8px 0 0" }}>{pattern.blurb}</p>

      <label style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12, cursor: info?.motor === false ? "default" : "pointer", opacity: info?.motor === false ? 0.55 : 1 }}>
        <input type="checkbox" checked={buzz} disabled={info?.motor === false}
          onChange={(e) => onSurf({ ...surf, haptics: e.target.checked })}
          style={{ width: 18, height: 18, accentColor: CALM }} />
        <span style={{ color: C.muted, fontSize: 12, lineHeight: 1.45 }}>
          <Vibrate size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />
          Vibrate with the breath
          <span style={{ display: "block", color: C.faint, fontSize: 11 }}>
            {info?.motor === false ? "This device has no vibration motor."
              : info?.strength === false && info?.route === "native" ? "Pulses on and off; this phone can't vary their strength."
              : info?.route === "web" ? "Pulses on and off through the browser."
              : "Stronger and closer as you breathe in, softer and further apart as you breathe out."}
          </span>
        </span>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={surf.auto}
          onChange={(e) => onSurf({ ...surf, auto: e.target.checked })}
          style={{ width: 18, height: 18, accentColor: CALM }} />
        <span style={{ color: C.muted, fontSize: 12, lineHeight: 1.45 }}>Start this as soon as I open the urge screen</span>
      </label>
    </div>
  );
}

function Running({ pattern, buzz, eyes, onEyes, onOpen, onStop }) {
  const [frame, setFrame] = useState(() => phaseAt(pattern, 0));
  const t0 = useRef(null);

  // One clock for the circle and the motor. The vibration for a breath starts when the breath does;
  // if the page was too busy to notice that moment on time, it waits for the next one rather than
  // buzzing the wrong part of the breath.
  useEffect(() => {
    t0.current = performance.now();
    let lastCycle = -1;
    const tick = () => {
      const t = (performance.now() - t0.current) / 1000;
      const ph = phaseAt(pattern, t);
      setFrame(ph);
      if (buzz && ph.cycle !== lastCycle) {
        lastCycle = ph.cycle;
        const into = t - ph.cycle * pattern.phases.reduce((a, x) => a + x.secs, 0);
        if (into < 0.6) playBreath(pattern);
      }
    };
    tick();
    const id = setInterval(tick, 50);
    return () => { clearInterval(id); stopBreath(); };
  }, [pattern, buzz]);

  // Eyes closed means the screen has to stay on, or the breath stops being shown while the buzz carries on.
  useEffect(() => {
    if (!eyes) return undefined;
    let lock = null;
    const ask = async () => { try { lock = await navigator.wakeLock?.request("screen"); } catch { /* optional */ } };
    ask();
    const again = () => { if (document.visibilityState === "visible") ask(); };
    document.addEventListener("visibilitychange", again);
    return () => { document.removeEventListener("visibilitychange", again); try { lock?.release?.(); } catch { /* gone already */ } };
  }, [eyes]);

  const circle = (size, color, dim) => (
    <div aria-hidden="true" style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `radial-gradient(circle at 50% 40%, ${alpha(color, dim ? 0.3 : 0.55)}, ${alpha(color, dim ? 0.12 : 0.2)})`,
      border: `2px solid ${alpha(color, dim ? 0.4 : 0.8)}`,
      transform: `scale(${frame.size})`,
    }} />
  );

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, margin: "12px 0 4px" }}>
        <div style={{ width: SIZE, height: SIZE, display: "grid", placeItems: "center" }}>{circle(SIZE, CALM, false)}</div>
        <div aria-live="off" style={{ textAlign: "center" }}>
          <p data-testid="breath-say" style={{ color: C.text, fontFamily: F.display, fontSize: 20, margin: 0 }}>{frame.say}</p>
          <p style={{ color: C.faint, fontSize: 12, margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>
            {Math.ceil(frame.left)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <button onClick={onEyes} style={{ ...styles.ghostCta, height: 40, fontSize: 12.5, flex: 1 }}>
            <EyeOff size={14} /> Eyes closed
          </button>
          <button onClick={onStop} style={{ ...styles.ghostCta, height: 40, fontSize: 12.5, width: 96 }}>Stop</button>
        </div>
      </div>

      {eyes && createPortal(
        <button onClick={onOpen} aria-label="Open your eyes" style={{
          position: "fixed", inset: 0, zIndex: 100000, background: "#000", border: 0, cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28,
          color: "#3a3a44", fontFamily: F.body,
        }}>
          {/* Barely there: enough to find if you look, nothing that lights a dark room. */}
          <div style={{ width: 220, height: 220, display: "grid", placeItems: "center" }}>{circle(220, "#2a6f6a", true)}</div>
          <span style={{ fontSize: 13 }}>
            {buzz ? "Follow the buzz. Tap anywhere to open your eyes." : "Tap anywhere to open your eyes."}
          </span>
        </button>,
        document.body,
      )}
    </>
  );
}
