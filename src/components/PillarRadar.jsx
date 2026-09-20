import React from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { C } from "../theme.js";

// The one chart on the landing view, in its own module so recharts can be loaded after the
// first paint rather than before it. Roughly half the bundle sits behind this import.
export default function PillarRadar({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="70%">
        <defs>
          <radialGradient id="mapfill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={C.gold} stopOpacity={0.42} />
            <stop offset="100%" stopColor={C.gold} stopOpacity={0.08} />
          </radialGradient>
        </defs>
        <PolarGrid stroke="rgba(255,255,255,0.08)" />
        <PolarAngleAxis dataKey="pillar" tick={{ fill: C.muted, fontSize: 10.5 }} />
        <Radar dataKey="value" stroke={C.gold} strokeWidth={2} fill="url(#mapfill)"
          dot={{ r: 3, fill: C.gold, strokeWidth: 0 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
