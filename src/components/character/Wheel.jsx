import React from "react";
import { C, alpha } from "../../theme.js";

const TONE = C.orange;
const SIZE = 280;
const R0 = 88;

/**
 * Your eight traits on one wheel: how fully each was lived over the last three months. A trait with no answers sits
 * at the centre and is drawn as a hollow dot, so "never practised" and "practised and failed" look different.
 */
export default function Wheel({ spokes, current }) {
  const c = SIZE / 2;
  const n = spokes.length;
  const at = (i, r) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r];
  };
  const points = spokes.map((s, i) => at(i, R0 * (s.value ?? 0)).join(",")).join(" ");
  const summary = spokes.map((s) => `${s.name}: ${s.value === null ? "not practised" : `${Math.round(s.value * 100)} percent`}`).join(", ");
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" role="img" aria-label={`Your virtue wheel. ${summary}`} style={{ display: "block", maxWidth: 320, margin: "0 auto" }}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={spokes.map((_, i) => at(i, R0 * f).join(",")).join(" ")} fill="none" stroke={C.border} strokeWidth="1" />
      ))}
      {spokes.map((s, i) => <line key={s.id} x1={c} y1={c} x2={at(i, R0)[0]} y2={at(i, R0)[1]} stroke={C.border} strokeWidth="1" />)}
      <polygon points={points} fill={alpha(TONE, 0.22)} stroke={TONE} strokeWidth="2" strokeLinejoin="round" />
      {spokes.map((s, i) => {
        const [x, y] = at(i, R0 * (s.value ?? 0));
        const [lx, ly] = at(i, R0 + 26);
        return (
          <g key={s.id}>
            <circle cx={x} cy={y} r="4" fill={s.value === null ? C.bg : TONE} stroke={s.value === null ? C.faint : TONE} strokeWidth="1.6" />
            <text x={lx} y={ly + 5} textAnchor="middle" fontSize="17">{s.emoji}</text>
            <text x={lx} y={ly + 19} textAnchor="middle" fontSize="9.5" fill={s.id === current ? C.text : C.faint} fontWeight={s.id === current ? 700 : 500}>{s.name}</text>
          </g>
        );
      })}
    </svg>
  );
}
