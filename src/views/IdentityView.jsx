import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { C, F, alpha, styles } from "../theme.js";
import { AUDIT_TAGS, PILLARS } from "../data/constants.js";
import { Card, EmptyState, Pill, SectionLabel } from "../components/ui.jsx";
import { Fingerprint } from "lucide-react";

export default function IdentityView({ state, tally, onPatch, onBack }) {
  const { identities, habitAudit, tasks } = state;
  const [auditText, setAuditText] = useState("");
  const [auditTag, setAuditTag] = useState("neutral");

  const addAudit = () => {
    if (!auditText.trim()) return;
    onPatch({ habitAudit: [...habitAudit, { id: Date.now(), text: auditText.trim(), verdict: auditTag }] });
    setAuditText("");
  };

  return (
    <div style={styles.page}>
      <button onClick={onBack} style={styles.back}>Back</button>
      <h1 style={styles.h1}>Identity</h1>
      <p style={styles.lede}>
        Every habit you finish is a small vote for the person you're becoming. Define who that is,
        pillar by pillar — then tag your habits with the pillar they build.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {PILLARS.map((p) => {
          const votes = tally[p.id] || 0;
          const tagged = tasks.filter((t) => t.pillarId === p.id && !t.archivedAt).length;
          return (
            <Card key={p.id} style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                <p.Icon size={16} color={p.color} />
                <span style={{ color: C.text, fontSize: 14, fontWeight: 550, flex: 1 }}>{p.name}</span>
                <span style={{ ...styles.tag, color: p.color, background: alpha(p.color, 0.13) }}>
                  {votes} vote{votes === 1 ? "" : "s"}
                </span>
              </div>
              <input value={identities[p.id] || ""} placeholder="I am someone who…"
                onChange={(e) => onPatch({ identities: { ...identities, [p.id]: e.target.value } })}
                style={{ ...styles.input, fontSize: 13 }} />
              <p style={{ color: C.faint, fontSize: 10.5, margin: "8px 0 0" }}>
                {tagged === 0
                  ? "No habits tagged to this pillar yet."
                  : `${tagged} habit${tagged === 1 ? "" : "s"} voting for this identity.`}
              </p>
            </Card>
          );
        })}
      </div>

      <SectionLabel>Habit audit</SectionLabel>
      <p style={{ color: C.muted, fontSize: 12.5, marginTop: -4, marginBottom: 12, lineHeight: 1.55 }}>
        List habits you already have and mark each one honestly — this is Clear's starting point for change.
      </p>

      <Card>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={auditText} onChange={(e) => setAuditText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAudit()}
            placeholder="Name a current habit…" style={{ ...styles.input, flex: 1, fontSize: 13.5 }} />
          <button onClick={addAudit} style={styles.addBtn}><Plus size={18} /></button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {Object.entries(AUDIT_TAGS).map(([k, v]) => (
            <Pill key={k} on={auditTag === k} color={v.color} onClick={() => setAuditTag(k)}>{v.label}</Pill>
          ))}
        </div>
      </Card>

      {habitAudit.length === 0 ? (
        <EmptyState Icon={Fingerprint} title="No habits listed yet"
          hint="Be honest about what you already do — good, bad and neutral." />
      ) : (
        <Card style={{ padding: "8px 14px" }}>
          {habitAudit.map((h) => {
            const tag = AUDIT_TAGS[h.verdict];
            return (
              <div key={h.id} style={styles.row}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: tag.color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: C.text, fontSize: 13.5 }}>{h.text}</span>
                <span style={{ ...styles.tag, color: tag.color, background: alpha(tag.color, 0.13) }}>{tag.label}</span>
                <button onClick={() => onPatch({ habitAudit: habitAudit.filter((x) => x.id !== h.id) })}
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
