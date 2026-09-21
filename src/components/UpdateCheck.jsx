import React, { useCallback, useEffect, useState } from "react";
import { ArrowUpCircle, Check, RefreshCw } from "lucide-react";
import { C, R, alpha, styles } from "../theme.js";
import {
  applyPlan, applyUpdate, checkForUpdate, currentBuild, describeBuild, manifestUrl, shouldCheck,
} from "../lib/updates.js";
import { SectionLabel } from "./ui.jsx";

const LAST_CHECK_KEY = "momentum:update:lastCheck";

const readLast = () => {
  try { return Number(window.localStorage.getItem(LAST_CHECK_KEY)) || null; } catch { return null; }
};
const writeLast = (at) => {
  try { window.localStorage.setItem(LAST_CHECK_KEY, String(at)); } catch { /* blocked storage */ }
};

/**
 * Whether a newer build has been published, and what that means here. Silent when there's
 * nothing to say: an update check that interrupts someone is worse than no update check.
 */
export default function UpdateCheck({ config }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState(readLast);

  const build = currentBuild();
  const url = config?.url ? manifestUrl(config) : "";
  const plan = applyPlan({
    hasServiceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    isNative: typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.(),
  });

  const check = useCallback(async (manual) => {
    if (!url) return;
    setBusy(true);
    const out = await checkForUpdate(url, { current: build });
    setBusy(false);
    setResult({ ...out, manual });
    const now = Date.now();
    setCheckedAt(now);
    writeLast(now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (!url || !shouldCheck(checkedAt)) return;
    check(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <>
      <SectionLabel>This build</SectionLabel>
      <div style={{ ...styles.card, borderColor: result?.available ? alpha(C.gold, 0.35) : C.border }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: C.text, fontSize: 13.5, margin: 0 }}>{describeBuild(build)}</p>
            <p style={{ color: C.faint, fontSize: 11, margin: "3px 0 0" }}>
              {build.build ? `Built ${new Date(build.build).toLocaleDateString()}` : "Build date unknown"}
              {url ? "" : " · no update channel set up"}
            </p>
          </div>
          {url && (
            <button onClick={() => check(true)} disabled={busy} aria-label="Check for updates"
              style={{ ...styles.ghostCta, height: 38, width: 112, fontSize: 12.5 }}>
              <RefreshCw size={13} /> {busy ? "…" : "Check"}
            </button>
          )}
        </div>

        {result?.available && (
          <div style={{
            background: alpha(C.gold, 0.08), border: `1px solid ${alpha(C.gold, 0.3)}`,
            borderRadius: R.md, padding: "12px 13px", marginTop: 12,
          }}>
            <p style={{ color: C.text, fontSize: 13, fontWeight: 600, margin: 0 }}>
              <ArrowUpCircle size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
              {describeBuild(result.latest)} is available
            </p>
            {result.latest.notes && (
              <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: "7px 0 0" }}>
                {result.latest.notes}
              </p>
            )}
            <p style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.55, margin: "8px 0 0" }}>
              {plan.text}
            </p>
            {plan.can && (
              <button onClick={() => applyUpdate()} style={{ ...styles.cta, height: 42, marginTop: 11, fontSize: 13 }}>
                <RefreshCw size={15} /> {plan.label}
              </button>
            )}
          </div>
        )}

        {/* Only after a deliberate check: an automatic one finding nothing should say nothing. */}
        {result && !result.available && result.manual && (
          <p style={{ color: C.muted, fontSize: 12, margin: "11px 0 0" }}>
            <Check size={12} color={C.green} style={{ verticalAlign: -1, marginRight: 6 }} />
            {result.reason === "current" ? "This is the newest build."
              : result.reason === "unreachable" ? "Couldn't reach the update channel just now."
              : result.reason === "not-configured" ? "No update channel is set up."
              : "Nothing new was found."}
          </p>
        )}
      </div>
    </>
  );
}
