import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, X } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { msUntilMidnight, todayStr } from "../lib/date.js";

export function Card({ children, style, flip, ...rest }) {
  return (
    <div className={flip ? "mtm-card-flip" : undefined} style={{ ...styles.card, ...style }} {...rest}>
      {children}
    </div>
  );
}

export function SectionLabel({ children, color, style }) {
  return <p style={{ ...styles.sectionLabel, ...(color ? { color } : {}), ...style }}>{children}</p>;
}

export function PageHeader({ eyebrow, title, onBack, actions }) {
  return (
    <>
      {onBack && (
        <button onClick={onBack} style={styles.back}>
          <ChevronLeft size={18} /> Back
        </button>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          {eyebrow && <p style={styles.eyebrow}>{eyebrow}</p>}
          <h1 style={styles.h1}>{title}</h1>
        </div>
        {actions && <div style={{ display: "flex", gap: 6, paddingBottom: 18, flexShrink: 0 }}>{actions}</div>}
      </div>
    </>
  );
}

export function IconButton({ onClick, title, children, active, danger, style }) {
  return (
    <button onClick={onClick} title={title} style={{
      ...styles.iconBtn,
      color: danger ? C.red : active ? C.gold : C.muted,
      borderColor: active ? alpha(C.gold, 0.45) : C.border,
      background: active ? C.goldSoft : C.surface,
      ...style,
    }}>
      {children}
    </button>
  );
}

export function Pill({ on, color = C.gold, onClick, children, style }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 13px", borderRadius: R.pill, cursor: "pointer", fontSize: 12.5, fontWeight: 500,
      fontFamily: F.body, whiteSpace: "nowrap", flexShrink: 0,
      border: `1px solid ${on ? color : C.border}`,
      background: on ? alpha(color, 0.14) : "transparent",
      color: on ? color : C.muted,
      ...style,
    }}>
      {children}
    </button>
  );
}

export function SegmentedControl({ options, value, onChange, style }) {
  return (
    <div style={{
      display: "flex", background: C.surface2, border: `1px solid ${C.border}`,
      borderRadius: R.md, padding: 3, gap: 2, ...style,
    }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            flex: 1, padding: "7px 6px", borderRadius: R.sm, cursor: "pointer", border: "none",
            background: on ? C.surface3 : "transparent", color: on ? C.text : C.muted,
            fontSize: 12, fontWeight: on ? 600 : 500, fontFamily: F.body, whiteSpace: "nowrap",
            transition: "background .15s ease, color .15s ease",
          }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Checkbox({ checked, onClick, color = C.gold, danger, size = 22, style, label }) {
  const ring = checked ? color : danger ? C.red : C.faint;
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={!!checked} style={{
      width: size, height: size, borderRadius: size > 19 ? 8 : 6, flexShrink: 0, cursor: "pointer",
      border: `1.6px solid ${ring}`, background: checked ? color : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "background .16s ease, border-color .16s ease", ...style,
    }}>
      {checked && <Check size={size * 0.58} color="#14131f" strokeWidth={3} className="mtm-pop" />}
    </button>
  );
}

export function ProgressBar({ pct, color = C.gold, height = 6, style }) {
  return (
    <div style={{ ...styles.track, height, ...style }}>
      <div style={{ ...styles.fill, width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function ProgressRing({ pct, size = 74, stroke = 7, color = C.gold, children }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset .6s cubic-bezier(.2,.8,.3,1)" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ Icon, title, hint, action }) {
  return (
    <div style={{ textAlign: "center", padding: "34px 20px" }}>
      {Icon && (
        <div style={{
          width: 46, height: 46, borderRadius: 15, background: C.surface2, margin: "0 auto 12px",
          display: "flex", alignItems: "center", justifyContent: "center", color: C.faint,
        }}>
          <Icon size={21} />
        </div>
      )}
      <p style={{ color: C.text, fontFamily: F.display, fontSize: 17, margin: "0 0 6px" }}>{title}</p>
      {hint && <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.55, margin: 0 }}>{hint}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function Sheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="mtm-backdrop" onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(8,7,13,0.66)", backdropFilter: "blur(3px)",
      zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div className="mtm-sheet" onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto",
        background: C.bgElev, borderTop: `1px solid ${C.borderStrong}`,
        borderRadius: `${R.xl}px ${R.xl}px 0 0`, padding: "10px 18px 22px",
      }}>
        <div style={{
          width: 38, height: 4, borderRadius: 2, background: C.surface3, margin: "0 auto 14px",
        }} />
        {title && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={styles.h2}>{title}</h2>
            <IconButton onClick={onClose} title="Close"><X size={16} /></IconButton>
          </div>
        )}
        {children}
        {footer && <div style={{ marginTop: 18 }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Toast({ toast, onAction, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    <div className="mtm-toast" style={{
      position: "absolute", left: 16, right: 16, bottom: 82, zIndex: 50,
      background: C.surface3, border: `1px solid ${C.borderStrong}`, borderRadius: R.md,
      padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 12px 30px -12px rgba(0,0,0,0.8)",
    }}>
      <span style={{ flex: 1, color: C.text, fontSize: 13 }}>{toast.message}</span>
      {toast.actionLabel && (
        <button onClick={onAction} style={{
          background: "none", border: "none", color: C.gold, fontWeight: 650, fontSize: 13,
          cursor: "pointer", fontFamily: F.body, padding: 0,
        }}>
          {toast.actionLabel}
        </button>
      )}
    </div>
  );
}

// Decorative 3D layers — absolutely positioned, never intercept touch
export function AmbientOrbs() {
  const orbs = useMemo(() => ([
    { color: C.purple, top: "3%", left: "-14%", size: 200, dur: 17, delay: 0 },
    { color: C.gold, top: "36%", left: "72%", size: 156, dur: 20, delay: 3 },
    { color: C.teal, top: "74%", left: "-10%", size: 178, dur: 23, delay: 6 },
  ]), []);
  return (
    <div className="mtm-orb-layer" aria-hidden="true">
      {orbs.map((o, i) => (
        <div key={i} className="mtm-orb" style={{
          top: o.top, left: o.left, width: o.size, height: o.size, background: o.color,
          ["--mtm-odur"]: `${o.dur}s`, ["--mtm-odelay"]: `${o.delay}s`,
        }} />
      ))}
    </div>
  );
}

export function SparkleField({ count = 14 }) {
  const sparkles = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    top: Math.random() * 100,
    left: Math.random() * 100,
    size: 7 + Math.random() * 9,
    dur: 3 + Math.random() * 3.5,
    delay: Math.random() * 5,
  })), [count]);
  return (
    <div className="mtm-sparkle-layer" aria-hidden="true">
      {sparkles.map((s) => (
        <SparkleGlyph key={s.id} s={s} />
      ))}
    </div>
  );
}

function SparkleGlyph({ s }) {
  return (
    <svg className="mtm-sparkle" width={s.size} height={s.size} viewBox="0 0 24 24" fill="currentColor" style={{
      top: `${s.top}%`, left: `${s.left}%`,
      ["--mtm-dur"]: `${s.dur}s`, ["--mtm-delay"]: `${s.delay}s`,
    }}>
      <path d="M12 0l2.4 8.2L22 12l-7.6 3.8L12 24l-2.4-8.2L2 12l7.6-3.8z" />
    </svg>
  );
}

// A ceiling on how long to sleep between checks, so a timer the browser throttled, or one
// that drifted while the machine was suspended, still corrects itself within the minute.
const MAX_SLEEP_MS = 60_000;

/**
 * Today's date, as a string that changes when the day actually does.
 *
 * Everything in the app reads todayStr() while rendering, which is only correct if something
 * re-renders when the day turns. Nothing did. Left open overnight the app kept yesterday's
 * date on screen, wrote habit ticks into yesterday's log, and never scheduled the new day's
 * reminders — all of it silent.
 *
 * A timer on its own doesn't fix it: a phone freezes timers the moment the screen goes off,
 * which is precisely the case that matters. So the day is re-checked when the page becomes
 * visible and when it regains focus as well. Every path runs the same string compare and
 * returns the current value unchanged when the day hasn't moved, so the usual outcome is no
 * re-render at all.
 */
export function useToday() {
  const [today, setToday] = useState(todayStr);

  useEffect(() => {
    let timer;
    const check = () => {
      setToday((cur) => {
        const now = todayStr();
        return now === cur ? cur : now;
      });
      clearTimeout(timer);
      // Land just past the turn rather than exactly on it, so a fast clock can't wake the
      // check a millisecond early and go back to sleep for another whole day.
      timer = setTimeout(check, Math.min(msUntilMidnight() + 1000, MAX_SLEEP_MS));
    };
    check();

    const onWake = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("pageshow", onWake);
    };
  }, []);

  return today;
}

export function useToast() {
  const [toast, setToast] = useState(null);
  const ref = useRef(null);
  useEffect(() => { ref.current = toast; }, [toast]);

  // These must keep a stable identity: Toast restarts its dismiss timer whenever
  // onDismiss changes, so fresh closures each render would keep the toast up forever.
  const show = useCallback((message, actionLabel, onAction) =>
    setToast({ message, actionLabel, onAction }), []);
  const dismiss = useCallback(() => setToast(null), []);
  const act = useCallback(() => {
    ref.current?.onAction?.();
    setToast(null);
  }, []);

  return { toast, show, dismiss, act };
}
