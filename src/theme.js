// ---- Design tokens ----
export const C = {
  bg: "#0F0E17",
  bgElev: "#16141F",
  surface: "#1C1A29",
  surface2: "#24212F",
  surface3: "#2E2A3D",
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.13)",
  text: "#F2EFFA",
  muted: "#A29DB8",
  faint: "#6B6683",
  gold: "#E8B75D",
  goldSoft: "rgba(232,183,93,0.14)",
  red: "#E8746F",
  green: "#6FC79B",
  blue: "#6FA8E8",
  purple: "#A99BE8",
  teal: "#5FC7C0",
  orange: "#E8946F",
  pink: "#E8749B",
};

export const R = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };
export const F = { display: "Fraunces, Georgia, serif", body: "Inter, system-ui, sans-serif" };

export const alpha = (hex, a) => {
  const n = Math.round(Math.min(1, Math.max(0, a)) * 255).toString(16).padStart(2, "0");
  return hex + n;
};

// ---- Shared style objects ----
export const styles = {
  app: {
    minHeight: "100vh",
    background: `radial-gradient(130% 70% at 50% -12%, #221D3A 0%, ${C.bg} 58%)`,
    color: C.text,
    fontFamily: F.body,
  },
  phone: {
    maxWidth: 460, margin: "0 auto", minHeight: "100vh", position: "relative",
    display: "flex", flexDirection: "column",
  },
  scroll: { flex: 1, overflowY: "auto", paddingBottom: 96, WebkitOverflowScrolling: "touch" },
  page: { padding: "22px 18px 8px" },

  eyebrow: { color: C.muted, fontSize: 11.5, letterSpacing: 1.3, textTransform: "uppercase", margin: 0, fontWeight: 500 },
  h1: { color: C.text, fontFamily: F.display, fontSize: 31, fontWeight: 600, margin: "6px 0 16px", letterSpacing: -0.6 },
  h2: { color: C.text, fontFamily: F.display, fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: -0.3 },
  sectionLabel: {
    color: C.muted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    margin: "24px 0 10px", fontWeight: 600,
  },
  lede: { color: C.muted, fontSize: 13.5, lineHeight: 1.6, marginTop: -8, marginBottom: 18 },

  card: {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg,
    padding: 16, marginBottom: 12,
  },
  cardTall: {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.xl,
    padding: 18, marginBottom: 14,
  },

  input: {
    width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: R.md,
    padding: "12px 14px", color: C.text, fontSize: 14, fontFamily: F.body,
    boxSizing: "border-box", outline: "none",
  },
  fieldShell: {
    display: "flex", alignItems: "center", gap: 7, background: C.surface2,
    border: `1px solid ${C.border}`, borderRadius: R.md, padding: "9px 12px",
  },
  bareInput: {
    background: "none", border: "none", outline: "none", color: C.text,
    fontSize: 13, fontFamily: F.body, colorScheme: "dark", minWidth: 0,
  },

  cta: {
    width: "100%", height: 52, borderRadius: R.md, border: "none", cursor: "pointer",
    background: C.gold, color: "#14131f", fontWeight: 650, fontSize: 15,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: F.body,
  },
  ghostCta: {
    width: "100%", height: 48, borderRadius: R.md, cursor: "pointer",
    background: "transparent", border: `1px solid ${C.borderStrong}`, color: C.text,
    fontWeight: 550, fontSize: 14, display: "flex", alignItems: "center",
    justifyContent: "center", gap: 8, fontFamily: F.body,
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: R.sm, border: `1px solid ${C.border}`,
    background: C.surface, color: C.muted, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  addBtn: {
    width: 46, flexShrink: 0, borderRadius: R.md, border: "none", background: C.gold,
    color: "#14131f", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  },
  back: {
    background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex",
    alignItems: "center", gap: 2, fontSize: 13.5, marginBottom: 6, padding: 0, fontFamily: F.body,
  },
  linkBtn: {
    display: "flex", alignItems: "center", gap: 5, background: "none", border: "none",
    color: C.muted, cursor: "pointer", fontSize: 11.5, padding: 0, fontFamily: F.body,
  },

  tag: {
    display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: C.muted,
    background: C.surface2, padding: "3px 7px", borderRadius: 7, flexShrink: 0, whiteSpace: "nowrap",
  },
  track: { height: 6, borderRadius: 4, background: "rgba(255,255,255,0.07)", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, transition: "width .45s cubic-bezier(.2,.8,.3,1)" },

  row: { display: "flex", alignItems: "center", gap: 9, padding: "9px 2px" },

  nav: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 68,
    background: "rgba(15,14,23,0.93)", backdropFilter: "blur(14px)",
    borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 30,
  },
  navBtn: {
    flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex",
    flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
    fontFamily: F.body, position: "relative",
  },
  fab: {
    position: "absolute", right: 18, bottom: 84, width: 54, height: 54, borderRadius: 18,
    border: "none", cursor: "pointer", background: `linear-gradient(140deg, ${C.gold}, ${C.orange})`,
    color: "#14131f", display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: `0 10px 28px -8px ${alpha(C.gold, 0.7)}`, zIndex: 25,
  },
};

// ---- Motion: decorative 3D layer + sheet/toast transitions ----
export const MOTION_CSS = `
@keyframes mtm-sparkle-move {
  0%   { opacity: 0;    transform: translate3d(0,0,0) scale(0.3) rotate(0deg); }
  40%  { opacity: 0.8;  transform: translate3d(4px,-10px,0) scale(1) rotate(110deg); }
  60%  { opacity: 0.8;  transform: translate3d(-3px,-18px,0) scale(0.85) rotate(170deg); }
  100% { opacity: 0;    transform: translate3d(0,-24px,0) scale(0.3) rotate(230deg); }
}
@keyframes mtm-orb-drift {
  0%, 100% { transform: translate3d(0,0,0) scale(1); }
  33%      { transform: translate3d(18px,-24px,0) scale(1.08); }
  66%      { transform: translate3d(-16px,16px,0) scale(0.93); }
}
@keyframes mtm-view-flip-in {
  0%   { opacity: 0; transform: perspective(1200px) rotateX(-9deg) translateY(10px) scale(0.985); }
  100% { opacity: 1; transform: perspective(1200px) rotateX(0deg) translateY(0) scale(1); }
}
@keyframes mtm-card-flip-in {
  0%   { opacity: 0; transform: perspective(900px) rotateX(-62deg); }
  100% { opacity: 1; transform: perspective(900px) rotateX(0deg); }
}
@keyframes mtm-shimmer-sweep {
  0%   { transform: translateX(-130%) skewX(-14deg); }
  100% { transform: translateX(230%) skewX(-14deg); }
}
@keyframes mtm-glow-pulse {
  0%, 100% { filter: drop-shadow(0 0 0px rgba(232,183,93,0)); }
  50%      { filter: drop-shadow(0 0 7px rgba(232,183,93,0.85)); }
}
@keyframes mtm-sheet-up {
  0%   { transform: translateY(100%); }
  100% { transform: translateY(0); }
}
@keyframes mtm-fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
@keyframes mtm-toast-in {
  0%   { opacity: 0; transform: translateY(16px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes mtm-pop {
  0%   { transform: scale(1); }
  45%  { transform: scale(1.22); }
  100% { transform: scale(1); }
}
@keyframes mtm-row-in {
  0%   { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes mtm-confetti-fall {
  0%   { opacity: 0; transform: translateY(-10vh) rotate(0deg); }
  10%  { opacity: 1; }
  100% { opacity: 0; transform: translateY(105vh) rotate(620deg); }
}

.mtm-orb-layer { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: -1; }
.mtm-orb {
  position: absolute; border-radius: 50%; filter: blur(44px); opacity: 0.3; will-change: transform;
  animation: mtm-orb-drift var(--mtm-odur, 16s) ease-in-out infinite;
  animation-delay: var(--mtm-odelay, 0s);
}
.mtm-sparkle-layer { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 2; }
.mtm-sparkle {
  position: absolute; color: #E8B75D; will-change: transform, opacity;
  animation: mtm-sparkle-move var(--mtm-dur, 4.5s) ease-in-out infinite;
  animation-delay: var(--mtm-delay, 0s);
}
.mtm-view-flip { animation: mtm-view-flip-in .42s cubic-bezier(.22,.8,.25,1) both; }
.mtm-card-flip { animation: mtm-card-flip-in .6s cubic-bezier(.2,.7,.3,1) both; transform-origin: 50% 100%; }
.mtm-row-in { animation: mtm-row-in .3s ease both; }
.mtm-shimmer { position: relative; overflow: hidden; }
.mtm-shimmer::after {
  content: ""; position: absolute; top: 0; left: 0; width: 45%; height: 100%;
  background: linear-gradient(75deg, transparent, rgba(255,255,255,0.38), transparent);
  animation: mtm-shimmer-sweep 3s ease-in-out infinite; pointer-events: none;
}
.mtm-glow-pulse { animation: mtm-glow-pulse 2.4s ease-in-out infinite; }
.mtm-confetti {
  animation: mtm-confetti-fall var(--mtm-cdur, 3s) linear var(--mtm-cdelay, 0s) forwards;
  pointer-events: none;
}
.mtm-sheet { animation: mtm-sheet-up .28s cubic-bezier(.2,.8,.25,1) both; }
.mtm-backdrop { animation: mtm-fade-in .2s ease both; }
.mtm-toast { animation: mtm-toast-in .26s cubic-bezier(.2,.8,.25,1) both; }
.mtm-pop { animation: mtm-pop .32s ease; }

input[type="date"]::-webkit-calendar-picker-indicator,
input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(0.7); cursor: pointer; }
textarea, input { font-family: Inter, system-ui, sans-serif; }
::-webkit-scrollbar { width: 0; height: 0; }

@media (prefers-reduced-motion: reduce) {
  .mtm-sparkle, .mtm-orb, .mtm-view-flip, .mtm-card-flip, .mtm-row-in,
  .mtm-shimmer::after, .mtm-glow-pulse, .mtm-sheet, .mtm-backdrop, .mtm-toast, .mtm-pop,
  .mtm-confetti {
    animation: none !important;
  }
}
`;
