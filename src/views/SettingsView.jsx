import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, BellOff, CheckCircle2, Clock, Download, Gauge, Moon, RotateCcw, Send, ShieldAlert,
  TriangleAlert, Upload, Volume2,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { formatTime12, prettyDate } from "../lib/date.js";
import {
  backupFilename, downloadJson, exportPayload, inspectImport, stateFromImport,
} from "../lib/backup.js";
import { NUDGE_KINDS, WEEKDAY_OPTIONS, notifySettings } from "../lib/nudges.js";
import {
  deliveryReport, notificationPermission, requestNotificationPermission, scheduleNudges,
  sendTestReminder,
} from "../lib/notify.js";
import { graduationStatus, reminderMode } from "../lib/automaticity.js";
import { Card, Pill, SectionLabel } from "../components/ui.jsx";

const TIER_COPY = {
  native: { tone: "good", text: "Real OS alarms. These fire even when the app is closed or the phone is asleep." },
  triggers: { tone: "good", text: "Scheduled through the service worker. These fire even when the app is closed." },
  foreground: { tone: "warn", text: "This browser can only fire reminders while Momentum is open in a tab. Install it to your home screen for alarms that survive closing it." },
  none: { tone: "bad", text: "This browser can't show notifications at all." },
};

function Row({ label, desc, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 0" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: C.text, fontSize: 13.5, margin: 0 }}>{label}</p>
        {desc && (
          <p style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.5, margin: "4px 0 0" }}>{desc}</p>
        )}
      </div>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>{children}</div>
    </div>
  );
}

function Switch({ on, onClick, label }) {
  return (
    <button onClick={onClick} role="switch" aria-checked={!!on} aria-label={label} style={{
      width: 44, height: 26, borderRadius: 13, cursor: "pointer", padding: 2,
      border: `1px solid ${on ? C.gold : C.border}`,
      background: on ? C.goldSoft : "transparent",
      display: "flex", justifyContent: on ? "flex-end" : "flex-start", alignItems: "center",
      transition: "background .15s ease",
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: 10, background: on ? C.gold : C.faint,
        transition: "background .15s ease",
      }} />
    </button>
  );
}

const TimeInput = ({ value, onChange, label }) => (
  <div style={{ ...styles.fieldShell, padding: "6px 10px" }}>
    <Clock size={12} color={C.muted} />
    <input type="time" value={value || ""} aria-label={label}
      onChange={(e) => onChange(e.target.value || null)}
      style={{ ...styles.bareInput, fontSize: 12.5 }} />
  </div>
);

export default function SettingsView({ state, onBack, onSetSetting, onUpdateTask, onRestore }) {
  const { tasks, settings, srbai = [] } = state;
  const notify = useMemo(() => notifySettings(settings), [settings]);
  const [perm, setPerm] = useState("default");
  const [report, setReport] = useState(null);
  const [testing, setTesting] = useState(null);
  const [exported, setExported] = useState(false);
  const [pending, setPending] = useState(null);
  const fileRef = useRef(null);

  const refresh = async () => {
    setPerm(await notificationPermission());
    setReport(await deliveryReport(state));
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [state]);

  const setNotify = (patch) => onSetSetting("notify", { ...notify, ...patch });

  const enable = async () => {
    const result = await requestNotificationPermission();
    setPerm(result);
    if (result === "granted") {
      onSetSetting("reminders", true);
      await scheduleNudges({ ...state, settings: { ...settings, reminders: true } });
      refresh();
    }
  };

  const test = async () => {
    setTesting("sending");
    const ok = await sendTestReminder("Momentum", "This is what a nudge will look like.");
    setTesting(ok === false ? "failed" : "sent");
    setTimeout(() => setTesting(null), 4000);
  };

  const exportNow = () => {
    downloadJson(backupFilename(), exportPayload(state));
    setExported(true);
    setTimeout(() => setExported(false), 4000);
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so choosing the same file twice still fires
    if (!file) return;
    let raw = "";
    try { raw = await file.text(); } catch { setPending({ ok: false, error: "That file couldn't be read." }); return; }
    setPending({ ...inspectImport(raw), name: file.name });
  };

  const on = settings.reminders !== false && perm === "granted";
  const tier = report?.capability?.level || "none";
  const tierCopy = TIER_COPY[tier] || TIER_COPY.none;
  const timedHabits = tasks.filter((t) => t.recurrence && t.time && !t.archivedAt);

  return (
    <div style={styles.page}>
      <button onClick={onBack} style={styles.back}>Back</button>
      <h1 style={styles.h1}>Settings</h1>

      {/* ---- Delivery truth ---- */}
      <SectionLabel>Notifications</SectionLabel>
      <Card style={{
        borderColor: on ? alpha(C.green, 0.28) : alpha(C.gold, 0.3),
        background: on
          ? `linear-gradient(135deg, ${alpha(C.green, 0.06)}, ${C.surface})`
          : `linear-gradient(135deg, ${alpha(C.gold, 0.07)}, ${C.surface})`,
      }}>
        <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
          {on ? <Bell size={16} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} />
            : <BellOff size={16} color={C.gold} style={{ flexShrink: 0, marginTop: 2 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>
              {perm === "denied" ? "Blocked by the system"
                : perm !== "granted" ? "Not turned on yet"
                : settings.reminders === false ? "Switched off"
                : "On"}
            </p>
            <p style={{
              color: tierCopy.tone === "good" ? C.muted : tierCopy.tone === "warn" ? C.orange : C.red,
              fontSize: 12, lineHeight: 1.5, margin: "5px 0 0",
            }}>
              {perm === "denied"
                ? "Momentum can't re-ask — you'll need to allow notifications for this site in your system or browser settings."
                : tierCopy.text}
            </p>
          </div>
        </div>

        {perm !== "granted" && perm !== "denied" && tier !== "none" && (
          <button onClick={enable} style={{ ...styles.cta, marginTop: 12 }}>
            <Bell size={17} /> Turn on notifications
          </button>
        )}

        {perm === "granted" && (
          <>
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 4 }}>
              <Row label="Send me nudges" desc="The master switch. Off means nothing is scheduled at all.">
                <Switch on={settings.reminders !== false} label="All notifications"
                  onClick={() => onSetSetting("reminders", settings.reminders === false)} />
              </Row>
            </div>

            {report && (
              <div style={{
                background: C.surface2, border: `1px solid ${C.border}`, borderRadius: R.md,
                padding: "11px 13px", marginTop: 8,
              }}>
                <p style={{ color: C.muted, fontSize: 11.5, margin: 0, lineHeight: 1.6 }}>
                  <b style={{ color: C.text }}>{report.total}</b> scheduled over the next 7 days
                  {report.via === "foreground" ? " (while the app stays open)" : ""}.
                </p>
                {report.upcoming.length > 0 && (
                  <p style={{ color: C.faint, fontSize: 11, margin: "6px 0 0", lineHeight: 1.6 }}>
                    Next: {report.upcoming[0].title} ·{" "}
                    {formatTime12(`${String(report.upcoming[0].at.getHours()).padStart(2, "0")}:${String(report.upcoming[0].at.getMinutes()).padStart(2, "0")}`)}
                  </p>
                )}
                {report.total === 0 && (
                  <p style={{ color: C.faint, fontSize: 11, margin: "6px 0 0", lineHeight: 1.55 }}>
                    Nothing to send. Habits only get a reminder if you give them a time, and a
                    graduated habit's prompt is withdrawn on purpose.
                  </p>
                )}
              </div>
            )}

            <button onClick={test} style={{ ...styles.ghostCta, height: 40, marginTop: 10, fontSize: 12.5 }}>
              {testing === "sent" ? <CheckCircle2 size={14} color={C.green} />
                : testing === "failed" ? <TriangleAlert size={14} color={C.red} />
                : <Send size={14} />}
              {testing === "sent" ? "Sent — check your notification shade"
                : testing === "failed" ? "Couldn't send one"
                : testing === "sending" ? "Sending…" : "Send a test nudge"}
            </button>
          </>
        )}
      </Card>

      {/* ---- What we're allowed to send ---- */}
      {perm === "granted" && settings.reminders !== false && (
        <>
          <SectionLabel>What you'll be nudged about</SectionLabel>
          <Card>
            {NUDGE_KINDS.map((k, i) => (
              <div key={k.id} style={{ borderTop: i ? `1px solid ${C.border}` : "none" }}>
                <Row label={k.label} desc={k.desc}>
                  {k.kind === "toggle" && (
                    <Switch on={notify[k.id]} label={k.label}
                      onClick={() => setNotify({ [k.id]: !notify[k.id] })} />
                  )}
                  {k.kind === "time" && (
                    <>
                      {notify[k.id] && (
                        <TimeInput value={notify[k.id]} label={`${k.label} time`}
                          onChange={(v) => setNotify({ [k.id]: v })} />
                      )}
                      <Switch on={!!notify[k.id]} label={k.label}
                        onClick={() => setNotify({ [k.id]: notify[k.id] ? null : k.fallback })} />
                    </>
                  )}
                  {k.kind === "weekly" && (
                    <Switch on={!!notify[k.id]} label={k.label}
                      onClick={() => setNotify({ [k.id]: notify[k.id] ? null : k.fallback })} />
                  )}
                </Row>
                {k.kind === "weekly" && notify.weekly && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", paddingBottom: 11, flexWrap: "wrap" }}>
                    {WEEKDAY_OPTIONS.map((d) => (
                      <Pill key={d.id} on={notify.weekly.day === d.id}
                        onClick={() => setNotify({ weekly: { ...notify.weekly, day: d.id } })}>
                        {d.label}
                      </Pill>
                    ))}
                    <TimeInput value={notify.weekly.time} label="Weekly planning time"
                      onChange={(v) => setNotify({ weekly: { ...notify.weekly, time: v || "18:00" } })} />
                  </div>
                )}
              </div>
            ))}
          </Card>

          {/* ---- Quiet hours ---- */}
          <SectionLabel>Quiet hours</SectionLabel>
          <Card>
            <Row label="Hold app-generated nudges overnight"
              desc="Applies to the morning, evening, weekly and comeback nudges. A reminder at a time you set yourself is still sent — that one was your decision, not the app's.">
              <Switch on={notify.quiet} label="Quiet hours"
                onClick={() => setNotify({ quiet: !notify.quiet })} />
            </Row>
            {notify.quiet && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", paddingTop: 4 }}>
                <Moon size={13} color={C.muted} />
                <TimeInput value={notify.quietStart} label="Quiet from"
                  onChange={(v) => setNotify({ quietStart: v || "22:00" })} />
                <span style={{ color: C.faint, fontSize: 12 }}>to</span>
                <TimeInput value={notify.quietEnd} label="Quiet until"
                  onChange={(v) => setNotify({ quietEnd: v || "07:00" })} />
              </div>
            )}
          </Card>

          {/* ---- Per habit ---- */}
          {timedHabits.length > 0 && (
            <>
              <SectionLabel>Per habit</SectionLabel>
              <Card>
                {timedHabits.map((t, i) => {
                  const mode = reminderMode(t, srbai);
                  const auto = graduationStatus(t, srbai);
                  return (
                    <div key={t.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "11px 0", borderTop: i ? `1px solid ${C.border}` : "none",
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          color: C.text, fontSize: 13, margin: 0, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {t.text}
                        </p>
                        <p style={{ color: C.faint, fontSize: 11, margin: "3px 0 0" }}>
                          {formatTime12(t.time)}
                          {mode === "faded" && " · withdrawn — this one graduated"}
                          {mode === "off" && " · off"}
                        </p>
                      </div>
                      {auto.id === "graduated" && (
                        <span style={{ ...styles.tag, color: C.green, background: alpha(C.green, 0.13) }}>
                          <Gauge size={9} /> {auto.mean}/7
                        </span>
                      )}
                      <Switch
                        on={mode === "on"}
                        label={`Reminder for ${t.text}`}
                        onClick={() => {
                          // Three states collapse onto one switch: off, on, and "on despite
                          // having graduated" — which needs the explicit keep to stick.
                          if (mode === "on") onUpdateTask(t.id, { reminder: false, keepReminder: false });
                          else if (mode === "faded") onUpdateTask(t.id, { reminder: true, keepReminder: true });
                          else onUpdateTask(t.id, { reminder: true });
                        }}
                      />
                    </div>
                  );
                })}
              </Card>
            </>
          )}
        </>
      )}

      {/* ---- Backup and restore ---- */}
      <SectionLabel>Your data</SectionLabel>
      <Card>
        <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: "0 0 13px" }}>
          Everything Momentum knows lives in this browser and nowhere else — habits, the
          completion log, journal entries, money records. Clearing site data or switching phone
          loses all of it. A backup is one plain JSON file you keep yourself.
        </p>
        <button onClick={exportNow} style={{ ...styles.cta, height: 46, fontSize: 14 }}>
          {exported ? <CheckCircle2 size={17} color={C.green} /> : <Download size={17} />}
          {exported ? "Saved to your downloads" : "Export a backup"}
        </button>

        <input ref={fileRef} type="file" accept="application/json,.json" onChange={pickFile}
          aria-label="Backup file" style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()}
          style={{ ...styles.ghostCta, height: 42, marginTop: 9, fontSize: 13 }}>
          <Upload size={14} /> Restore from a file
        </button>

        {pending && !pending.ok && (
          <div style={{
            background: alpha(C.red, 0.08), border: `1px solid ${alpha(C.red, 0.3)}`,
            borderRadius: R.md, padding: "11px 13px", marginTop: 11,
          }}>
            <p style={{ color: C.red, fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
              <TriangleAlert size={12} style={{ verticalAlign: -1, marginRight: 5 }} />
              {pending.error}
            </p>
            <button onClick={() => setPending(null)} style={{ ...styles.linkBtn, color: C.muted, marginTop: 8 }}>
              Close
            </button>
          </div>
        )}

        {pending?.ok && (
          <div style={{
            background: C.surface2, border: `1px solid ${alpha(C.gold, 0.32)}`,
            borderRadius: R.md, padding: "13px 14px", marginTop: 11,
          }}>
            <p style={{ color: C.text, fontSize: 13, fontWeight: 600, margin: 0 }}>
              {pending.name}
            </p>
            <p style={{ color: C.faint, fontSize: 11, margin: "3px 0 10px" }}>
              {pending.exportedAt
                ? `Exported ${prettyDate(pending.exportedAt.slice(0, 10))}`
                : "No export date in this file"}
              {pending.schema != null && ` · schema v${pending.schema}`}
            </p>
            {pending.summary.length === 0 ? (
              <p style={{ color: C.orange, fontSize: 12, lineHeight: 1.55, margin: "0 0 10px" }}>
                This backup is readable but empty. Restoring it would leave you with nothing.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 11 }}>
                {pending.summary.map(([label, n]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.muted, fontSize: 12 }}>{label}</span>
                    <span style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{n}</span>
                  </div>
                ))}
              </div>
            )}
            <p style={{ color: C.orange, fontSize: 11.5, lineHeight: 1.55, margin: "0 0 11px" }}>
              <ShieldAlert size={12} style={{ verticalAlign: -1, marginRight: 5 }} />
              This replaces everything currently in the app. Export what's here first if you
              aren't sure.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { onRestore(stateFromImport(pending.data)); setPending(null); }}
                style={{ ...styles.cta, height: 42, fontSize: 13, flex: 1 }}>
                <RotateCcw size={15} /> Replace everything
              </button>
              <button onClick={() => setPending(null)} style={{ ...styles.ghostCta, height: 42, fontSize: 13, width: 92 }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Card>

      <SectionLabel>In the app</SectionLabel>
      <Card>
        <Row label="Show completed tasks" desc="Keep finished items visible in lists instead of tucking them away.">
          <Switch on={!!settings.showCompleted} label="Show completed"
            onClick={() => onSetSetting("showCompleted", !settings.showCompleted)} />
        </Row>
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          <Row label="Motion and sparkles" desc="Turn the ambient animation down if it's distracting.">
            <Switch on={settings.motion !== false} label="Motion"
              onClick={() => onSetSetting("motion", settings.motion === false)} />
          </Row>
        </div>
      </Card>

      <p style={{ color: C.faint, fontSize: 11, lineHeight: 1.6, margin: "18px 0 0" }}>
        <Volume2 size={11} style={{ verticalAlign: -1, marginRight: 5 }} />
        Momentum keeps prompts deliberately sparse. The research this app is built on is clear
        that leaning on reminders builds dependence on the reminder, not the habit — so the
        goal is to need these less over time, not more.
      </p>
    </div>
  );
}
