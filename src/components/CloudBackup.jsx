import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, CloudOff, CloudUpload, Database, Download, GitMerge, LogOut, RefreshCw, ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { C, R, alpha, styles } from "../theme.js";
import {
  backupBody, configProblem, deviceName, fingerprint, isConfigured, pushDecision,
  remoteFacts, restorePreview, stateFromCloud, statusLine, weigh,
} from "../lib/cloud.js";
import {
  checkProject, headBackup, pullBackup, pushBackup, signIn, signUp, signOut, validSession,
} from "../lib/supabase.js";
import { mergePreview } from "../lib/merge.js";
import { SectionLabel } from "./ui.jsx";

// The one place a person can see whether their data exists anywhere but this phone.
export default function CloudBackup({
  state, config, session, meta, onSaveConfig, onSession, onMeta, onRestore, lastPush,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState(config.url || "");
  const [anonKey, setAnonKey] = useState(config.anonKey || "");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmShrink, setConfirmShrink] = useState(null);

  const ready = isConfigured(config);
  const signedIn = !!session?.user?.id;
  const problem = configProblem(config);

  const run = useCallback(async (label, fn) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try { await fn(); }
    catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(null); }
  }, []);

  // ---- Setting the project up ----
  const saveConfig = () => run("config", async () => {
    const next = { url: url.trim(), anonKey: anonKey.trim() };
    const bad = configProblem(next);
    if (bad) throw new Error(bad);
    const check = await checkProject(next);
    if (!check.ok) {
      throw new Error(check.reason === "no-table"
        ? "Reached the project, but the backups table isn't there yet. Run the setup SQL first."
        : "Couldn't reach that project. Check the URL, and check you're online.");
    }
    onSaveConfig(next);
    setNotice("Project connected.");
  });

  // ---- Accounts ----
  const doSignIn = () => run("signin", async () => {
    const s = await signIn(config, email.trim(), password);
    onSession(s);
    setPassword("");
    const row = await headBackup(config, s).catch(() => null);
    onMeta(row);
    setNotice(row ? "Signed in. There's a backup in this account." : "Signed in.");
  });

  const doSignUp = () => run("signup", async () => {
    const out = await signUp(config, email.trim(), password);
    setPassword("");
    if (out.needsConfirmation) {
      setNotice("Account made — check your email for the confirmation link, then sign in.");
      return;
    }
    onSession(out.session);
    setNotice("Account made and signed in.");
  });

  const doSignOut = () => run("signout", async () => {
    await signOut(config, session);
    onSession(null);
    onMeta(null);
    setPreview(null);
    setNotice("Signed out on this device. The backup is untouched.");
  });

  // ---- The backup itself ----
  const doPush = (force = false) => run("push", async () => {
    const live = await validSession(config, session);
    if (live !== session) onSession(live);
    const decision = pushDecision({ state, lastPush, remote: remoteFacts(meta), force });
    if (!decision.push && decision.needsConfirmation) {
      setConfirmShrink({ local: decision.local, remote: decision.remote });
      return;
    }
    const row = await pushBackup(config, live, {
      payload: backupBody(state),
      device: deviceName(typeof navigator === "undefined" ? "" : navigator.userAgent),
      schema: state.version,
      items: weigh(state),
    });
    setConfirmShrink(null);
    onMeta(row);
    setNotice("Backed up.");
  });

  const doPreview = () => run("pull", async () => {
    const live = await validSession(config, session);
    if (live !== session) onSession(live);
    const row = await pullBackup(config, live);
    const p = restorePreview(row, state);
    if (!p.ok) throw new Error(p.error);
    setPreview(p);
  });

  const doRestore = () => {
    onRestore(stateFromCloud(preview.data));
    setPreview(null);
    setNotice("Restored from the cloud copy.");
  };

  // Replacing is the safe, explicable option and stays the default. Merging is offered only
  // when it would actually bring something back, because "merge (0 new things)" is a button
  // that does nothing but sound reassuring.
  const merge = preview ? mergePreview(state, stateFromCloud(preview.data)) : null;
  const doMerge = () => {
    onRestore(merge.merged);
    setPreview(null);
    setNotice(`Merged — ${merge.total} thing${merge.total === 1 ? "" : "s"} came back.`);
  };

  // Keep the status line honest without asking the server on every render.
  useEffect(() => {
    if (!signedIn || meta) return undefined;
    let cancelled = false;
    headBackup(config, session)
      .then((row) => { if (!cancelled && row) onMeta(row); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [signedIn, meta, config, session, onMeta]);

  const unsaved = useMemo(
    () => signedIn && lastPush?.fingerprint !== fingerprint(state),
    [signedIn, lastPush, state],
  );

  return (
    <>
      <SectionLabel>Cloud backup</SectionLabel>
      <div style={{
        ...styles.card,
        borderColor: signedIn ? alpha(C.green, 0.28) : C.border,
      }}>
        {/* ---- Not configured ---- */}
        {!ready && (
          <>
            <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
              <Database size={16} color={C.gold} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>
                  Keep a copy off this device
                </p>
                <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: "5px 0 0" }}>
                  Point this at a Supabase project you own and your data gets backed up to it
                  automatically. It's a backup, not sync — the newest device to back up wins,
                  so editing on two at once will lose one of them.
                </p>
              </div>
            </div>
            <input value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourproject.supabase.co" aria-label="Project URL"
              autoCapitalize="off" autoCorrect="off" spellCheck={false}
              style={{ ...styles.input, marginTop: 13, fontSize: 13 }} />
            <input value={anonKey} onChange={(e) => setAnonKey(e.target.value)}
              placeholder="anon / public key" aria-label="Anon key"
              autoCapitalize="off" autoCorrect="off" spellCheck={false}
              style={{ ...styles.input, marginTop: 8, fontSize: 13 }} />
            <p style={{ color: C.faint, fontSize: 11, lineHeight: 1.55, margin: "9px 0 0" }}>
              <ShieldAlert size={11} style={{ verticalAlign: -1, marginRight: 5 }} />
              The anon key is meant to be public — it names the project, it doesn't open it.
              Never paste the service role key here; that one bypasses every policy.
            </p>
            <button onClick={saveConfig} disabled={busy === "config"}
              style={{ ...styles.cta, height: 44, marginTop: 12, fontSize: 13.5 }}>
              {busy === "config" ? <RefreshCw size={15} /> : <Database size={15} />}
              {busy === "config" ? "Checking…" : "Connect"}
            </button>
          </>
        )}

        {/* ---- Configured, signed out ---- */}
        {ready && !signedIn && (
          <>
            <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>Sign in to back up</p>
            <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: "5px 0 12px" }}>
              Your data goes into your own project, under your own account. Nobody else can
              read it — that's enforced by the database, not by this app.
            </p>
            <input value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Email" aria-label="Email" type="email"
              autoCapitalize="off" autoCorrect="off" spellCheck={false}
              style={{ ...styles.input, fontSize: 14 }} />
            <input value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Password" aria-label="Password" type="password"
              style={{ ...styles.input, marginTop: 8, fontSize: 14 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={doSignIn} disabled={!email.trim() || !password || !!busy}
                style={{ ...styles.cta, height: 44, flex: 1, fontSize: 13.5, opacity: email.trim() && password ? 1 : 0.5 }}>
                {busy === "signin" ? "Signing in…" : "Sign in"}
              </button>
              <button onClick={doSignUp} disabled={!email.trim() || !password || !!busy}
                style={{ ...styles.ghostCta, height: 44, width: 108, fontSize: 13 }}>
                {busy === "signup" ? "…" : "Sign up"}
              </button>
            </div>
            <button onClick={() => onSaveConfig({ url: "", anonKey: "" })}
              style={{ ...styles.linkBtn, margin: "12px auto 0", color: C.faint }}>
              Use a different project
            </button>
          </>
        )}

        {/* ---- Signed in ---- */}
        {ready && signedIn && (
          <>
            <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
              <CloudUpload size={16} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>
                  {statusLine(meta)}
                </p>
                <p style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.5, margin: "4px 0 0" }}>
                  {session.user.email}
                  {meta?.device ? ` · last from ${meta.device}` : ""}
                  {unsaved ? " · changes not backed up yet" : ""}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
              <button onClick={() => doPush(false)} disabled={!!busy}
                style={{ ...styles.ghostCta, height: 42, flex: 1, fontSize: 13 }}>
                {busy === "push" ? <RefreshCw size={14} /> : <CloudUpload size={14} />}
                {busy === "push" ? "Backing up…" : "Back up now"}
              </button>
              <button onClick={doPreview} disabled={!!busy}
                style={{ ...styles.ghostCta, height: 42, flex: 1, fontSize: 13 }}>
                <Download size={14} /> {busy === "pull" ? "Fetching…" : "Restore"}
              </button>
            </div>

            <button onClick={doSignOut} disabled={!!busy}
              style={{ ...styles.linkBtn, margin: "13px auto 0", color: C.faint }}>
              <LogOut size={12} /> Sign out on this device
            </button>
          </>
        )}

        {/* ---- A shrinking backup asks first ---- */}
        {confirmShrink && (
          <Notice tone="warn" icon={TriangleAlert}>
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              This would replace a backup holding {confirmShrink.remote} things with one
              holding {confirmShrink.local}. If you meant to clear things out, go ahead —
              otherwise this is worth a second look first.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
              <button onClick={() => doPush(true)} style={{ ...styles.ghostCta, height: 38, fontSize: 12.5, flex: 1 }}>
                Back up anyway
              </button>
              <button onClick={() => setConfirmShrink(null)} style={{ ...styles.linkBtn, color: C.faint }}>
                Cancel
              </button>
            </div>
          </Notice>
        )}

        {/* ---- Restore, behind a preview ---- */}
        {preview && (
          <Notice tone="gold" icon={Download}>
            <p style={{ color: C.text, fontSize: 13, fontWeight: 600, margin: 0 }}>
              {statusLine(preview.at ? { updated_at: preview.at } : null)}
              {preview.device ? ` · from ${preview.device}` : ""}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, margin: "10px 0" }}>
              {preview.summary.map(([label, n]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.muted, fontSize: 12 }}>{label}</span>
                  <span style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{n}</span>
                </div>
              ))}
            </div>
            <p style={{ color: preview.losing > 0 ? C.orange : C.muted, fontSize: 11.5, lineHeight: 1.55, margin: "0 0 11px" }}>
              {preview.losing > 0
                ? `This replaces everything on this device — ${preview.losing} more things are here than in the backup. Export a file first if you're unsure.`
                : "This replaces everything currently on this device."}
            </p>
            {merge?.total > 0 && (
              <div style={{
                background: alpha(C.green, 0.07), border: `1px solid ${alpha(C.green, 0.25)}`,
                borderRadius: R.md, padding: "11px 12px", margin: "0 0 11px",
              }}>
                <p style={{ color: C.text, fontSize: 12.5, fontWeight: 600, margin: 0 }}>
                  <GitMerge size={12} style={{ verticalAlign: -1, marginRight: 6 }} />
                  Or keep both: {merge.total} thing{merge.total === 1 ? "" : "s"} only in the backup
                </p>
                <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.55, margin: "6px 0 0" }}>
                  Merging adds what this device is missing and keeps what it has. If the same
                  thing was edited in both places, the later edit wins — that part a merge
                  cannot do for you.
                </p>
                <button onClick={doMerge}
                  style={{ ...styles.ghostCta, height: 38, fontSize: 12.5, width: "100%", marginTop: 9 }}>
                  <GitMerge size={14} /> Merge instead
                </button>
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={doRestore} style={{ ...styles.cta, height: 40, fontSize: 13, flex: 1 }}>
                <Check size={15} /> Replace what's here
              </button>
              <button onClick={() => setPreview(null)} style={{ ...styles.ghostCta, height: 40, fontSize: 13, width: 92 }}>
                Cancel
              </button>
            </div>
          </Notice>
        )}

        {error && (
          <Notice tone="bad" icon={CloudOff}>
            <p style={{ margin: 0, lineHeight: 1.55 }}>{error}</p>
          </Notice>
        )}
        {notice && !error && (
          <Notice tone="good" icon={Check}>
            <p style={{ margin: 0, lineHeight: 1.55 }}>{notice}</p>
          </Notice>
        )}
        {ready && problem && (
          <p style={{ color: C.orange, fontSize: 11.5, margin: "10px 0 0" }}>{problem}</p>
        )}
      </div>
    </>
  );
}

const TONES = { good: C.green, bad: C.red, warn: C.orange, gold: C.gold };

function Notice({ tone, icon: Icon, children }) {
  const color = TONES[tone] || C.muted;
  return (
    <div style={{
      background: alpha(color, 0.07), border: `1px solid ${alpha(color, 0.28)}`,
      borderRadius: R.md, padding: "11px 13px", marginTop: 11,
      color: C.muted, fontSize: 12.5,
    }}>
      <Icon size={13} color={color} style={{ float: "left", marginRight: 8, marginTop: 2 }} />
      {children}
    </div>
  );
}
