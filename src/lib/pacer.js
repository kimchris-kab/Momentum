// A breathing pacer for riding out an urge: what phase of the breath it is at any moment, how big
// the circle should be, and the pattern of vibration that lets someone follow it with their eyes
// closed. All of it is a pure function of elapsed time, so the screen and the phone's motor can be
// driven from the same clock and cannot drift apart, and so it can be tested without either.

// Sizes are fractions of the full circle. A breath never quite empties it, so there is always
// something there to watch.
const LOW = 0.25;

/**
 * Three patterns, each a list of phases. `from` and `to` are the circle's size at the start and end
 * of the phase. The long exhale in each is deliberate: breathing out slowly is the part that slows
 * the heart, which is why all of these are weighted toward it or even.
 */
export const PATTERNS = [
  {
    id: "slow", label: "Slow breath", blurb: "4 in, 6 out. The long breath out is what settles you.",
    phases: [
      { kind: "in", secs: 4, from: LOW, to: 1 },
      { kind: "out", secs: 6, from: 1, to: LOW },
    ],
  },
  {
    id: "box", label: "Box", blurb: "4 in, hold, 4 out, hold. Steady, and easy to keep count of.",
    phases: [
      { kind: "in", secs: 4, from: LOW, to: 1 },
      { kind: "hold", secs: 4, from: 1, to: 1 },
      { kind: "out", secs: 4, from: 1, to: LOW },
      { kind: "hold", secs: 4, from: LOW, to: LOW },
    ],
  },
  {
    id: "sigh", label: "Double sigh", blurb: "Two quick breaths in, one long breath out. The fastest way to drop a gear.",
    phases: [
      { kind: "in", secs: 2, from: LOW, to: 0.75 },
      { kind: "top", secs: 1, from: 0.75, to: 1 },
      { kind: "out", secs: 6, from: 1, to: LOW },
    ],
  },
];

export const PATTERN_BY_ID = Object.fromEntries(PATTERNS.map((p) => [p.id, p]));
export const DEFAULT_SURF = { pattern: "slow", haptics: true, auto: false };

/** The person's settings with anything missing or unrecognised filled in. */
export function surfSettings(settings) {
  const s = settings?.surf || {};
  return {
    pattern: PATTERN_BY_ID[s.pattern] ? s.pattern : DEFAULT_SURF.pattern,
    haptics: s.haptics !== false,
    auto: s.auto === true,
  };
}

export const cycleSecs = (pattern) => pattern.phases.reduce((a, p) => a + p.secs, 0);

const SAY = { in: "Breathe in", top: "A little more", out: "Breathe out", hold: "Hold" };
const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x); // slow at both ends, the way a breath is

/**
 * Where the breath is `t` seconds in. `size` is 0.25 to 1 and is what the circle is drawn at; `left`
 * is how long until the phase changes, which is what a counter shows.
 */
export function phaseAt(pattern, t) {
  const len = cycleSecs(pattern);
  const time = Math.max(0, t);
  const cycle = Math.floor(time / len);
  let into = time - cycle * len;
  for (let i = 0; i < pattern.phases.length; i++) {
    const ph = pattern.phases[i];
    if (into < ph.secs || i === pattern.phases.length - 1) {
      const frac = Math.min(1, into / ph.secs);
      return {
        cycle, index: i, kind: ph.kind, say: SAY[ph.kind], frac,
        size: ph.from + (ph.to - ph.from) * ease(frac),
        left: Math.max(0, ph.secs - into),
      };
    }
    into -= ph.secs;
  }
  /* c8 ignore next */ return null;
}

// ---- The vibration ----
// A breath you can feel: a patter of short pulses that gets stronger and closer together as you
// breathe in, and weaker and further apart as you breathe out, with nothing at all on a hold. Both
// the strength and the spacing change, because not every phone's motor can vary its strength — on
// one that can't, the quickening still reads as the breath filling.
const PULSE_MS = 28;
const STRONG = 255;
const SOFT = 40;
const CLOSE_MS = 80;   // pulse-to-pulse at the fullest
const FAR_MS = 260;    // pulse-to-pulse at the emptiest

const lerp = (a, b, x) => a + (b - a) * x;

/**
 * One full breath as a vibration waveform: parallel arrays of durations in ms and strengths 0–255,
 * alternating off and on and starting with off, which is the shape Android's waveform wants. The
 * durations add up to exactly the length of the breath, so playing one per cycle stays in step.
 */
export function hapticCycle(pattern) {
  const segs = []; // { ms, amp }
  const push = (ms, amp) => {
    if (ms <= 0) return;
    const last = segs[segs.length - 1];
    if (last && (last.amp > 0) === (amp > 0) && (amp === 0)) last.ms += ms; // merge neighbouring silences
    else segs.push({ ms, amp });
  };

  pattern.phases.forEach((ph) => {
    const total = Math.round(ph.secs * 1000);
    if (ph.kind === "hold") { push(total, 0); return; }
    // How full the breath is runs from the phase's start to its end; pulses follow it.
    const fillAt = (x) => lerp(ph.from, ph.to, x);
    let spent = 0;
    while (spent < total) {
      // What's left is too short for a pulse and a rest: all rest. This also guarantees a phase never
      // ends on a pulse that would run into the next phase's first one — two in a row are one long one.
      if (total - spent <= PULSE_MS) { push(total - spent, 0); break; }
      const x = spent / total;
      const fill = (fillAt(x) - LOW) / (1 - LOW); // 0 empty … 1 full
      const gap = Math.round(lerp(FAR_MS, CLOSE_MS, fill));
      push(PULSE_MS, Math.round(lerp(SOFT, STRONG, fill)));
      spent += PULSE_MS;
      const off = Math.min(Math.max(0, gap - PULSE_MS), total - spent);
      push(off, 0);
      spent += off;
    }
  });

  if (segs.length && segs[0].amp > 0) segs.unshift({ ms: 0, amp: 0 }); // the pattern starts with an "off"
  // Two pulses never touch (there is always a gap), so on and off already alternate; a trailing
  // pulse is followed by nothing and that is fine.
  return { timings: segs.map((s) => s.ms), amplitudes: segs.map((s) => s.amp) };
}

/** The same breath as a pattern for navigator.vibrate, which only knows on and off and starts with on. */
export function vibratePattern(wave) {
  const t = wave.timings.slice();
  if (t.length && wave.amplitudes[0] === 0 && t[0] === 0) t.shift();
  return t;
}
