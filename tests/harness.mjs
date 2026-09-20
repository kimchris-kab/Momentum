// A test harness small enough to read in one sitting, with no dependencies.
//
// The app has no build step for its logic — every lib is a plain ES module — so the tests
// import them directly and run under `node tests/run.mjs`. Nothing to install, nothing to
// configure, and a failing assertion prints what it got next to what it wanted.

const results = { pass: 0, fail: 0, failures: [] };

export function suite(name) {
  let group = null;
  const label = (n) => (group ? `${group} · ${n}` : n);

  const record = (n, cond, detail) => {
    if (cond) {
      results.pass++;
    } else {
      results.fail++;
      results.failures.push({ file: name, name: label(n), detail });
    }
    return cond;
  };

  return {
    /** A named assertion. `detail` is printed only on failure. */
    ok: (n, cond, detail) => record(n, !!cond, detail),
    /** Deep equality by JSON shape — enough for the plain data this app deals in. */
    eq: (n, got, want) => record(n, JSON.stringify(got) === JSON.stringify(want), { got, want }),
    /** For money and averages, where exact float equality is the wrong question. */
    near: (n, got, want, tol = 0.011) =>
      record(n, typeof got === "number" && Math.abs(got - want) <= tol, { got, want, tol }),
    throws: (n, fn) => {
      try { fn(); return record(n, false, "did not throw"); }
      catch { return record(n, true); }
    },
    /** Groups read as a prefix on failures, so a failure names the behaviour and the case. */
    group: (g) => { group = g; },
  };
}

export const totals = () => results;

// ---- A fixed clock ----
// Half the library defaults to "today" internally — streaks, agendas, nudges — so the tests
// pin the date rather than writing assertions that rot overnight.
const RealDate = Date;

export function freezeDate(iso) {
  const fixed = new RealDate(iso).getTime();
  class Frozen extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() { return fixed; }
  }
  globalThis.Date = Frozen;
  return fixed;
}

export function unfreezeDate() {
  globalThis.Date = RealDate;
}

/** Runs `fn` with the clock pinned, and always puts the real one back. */
export function atDate(iso, fn) {
  freezeDate(iso);
  try { return fn(); } finally { unfreezeDate(); }
}
