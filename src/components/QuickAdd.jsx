import React, { useMemo, useRef, useState } from "react";
import {
  CalendarClock, Clock, Flag, ListTodo, Plus, Repeat, Sparkles, Target, X,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { PILLARS } from "../data/constants.js";
import { PARSE_EXAMPLES, parseTaskInput } from "../lib/parse.js";

const CHIP_ICON = {
  date: CalendarClock,
  time: Clock,
  repeat: Repeat,
  priority: Flag,
  list: ListTodo,
  pillar: Target,
};

// One-line capture. The parser's matches are shown as chips before anything is saved, and
// each chip can be dismissed to hand the word back to the title — so a wrong guess costs a
// tap, never a wrong task.
export default function QuickAdd({
  lists = [], defaultListId = "inbox", kind = "todo", accent = C.gold,
  placeholder = "Add a task…", autoFocus = false, onAdd, onMore,
}) {
  const [draft, setDraft] = useState("");
  const [ignore, setIgnore] = useState(() => new Set());
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const parsed = useMemo(
    () => parseTaskInput(draft, { lists, pillars: PILLARS, ignore }),
    [draft, lists, ignore]);

  const title = parsed.text.trim() || draft.trim();
  const canAdd = title.length > 0;

  const reset = () => {
    setDraft("");
    setIgnore(new Set());
  };

  const submit = () => {
    if (!canAdd) return;
    onAdd({
      text: title,
      kind,
      listId: parsed.patch.listId || defaultListId,
      ...parsed.patch,
      // A repeat with no due date would otherwise strand a plain task in "No date".
      dueDate: parsed.patch.recurrence ? null : (parsed.patch.dueDate ?? null),
    });
    reset();
    inputRef.current?.focus();
  };

  const dismiss = (id) => setIgnore((cur) => new Set([...cur, id]));

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, background: C.surface2,
        border: `1px solid ${focused ? alpha(accent, 0.45) : C.border}`,
        borderRadius: R.md, padding: "4px 4px 4px 12px",
      }}>
        <input
          ref={inputRef} value={draft} autoFocus={autoFocus} placeholder={placeholder}
          onChange={(e) => { setDraft(e.target.value); setIgnore(new Set()); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          style={{ ...styles.bareInput, flex: 1, minWidth: 0, fontSize: 13.5, padding: "9px 0" }}
        />
        <button
          onClick={submit} disabled={!canAdd} title="Add"
          style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0, border: "none",
            cursor: canAdd ? "pointer" : "default",
            background: canAdd ? alpha(accent, 0.18) : "transparent",
            color: canAdd ? accent : C.faint,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Plus size={17} strokeWidth={2.6} />
        </button>
      </div>

      {parsed.tokens.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
          <span style={{ color: C.faint, fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Reading as
          </span>
          {parsed.tokens.map((t) => {
            const Icon = CHIP_ICON[t.kind] || Sparkles;
            return (
              <span key={t.id} style={{
                display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 5px 4px 9px",
                borderRadius: R.pill, fontSize: 11.5, fontFamily: F.body,
                color: accent, background: alpha(accent, 0.13),
                border: `1px solid ${alpha(accent, 0.3)}`,
              }}>
                <Icon size={10} />
                {t.label}
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => dismiss(t.id)}
                  title={`Keep "${t.raw.trim()}" in the title instead`}
                  style={{
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    color: alpha(accent, 0.75), display: "flex", lineHeight: 0,
                  }}
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {focused && !draft && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", paddingBottom: 2 }}>
          {PARSE_EXAMPLES.map((ex) => (
            <button
              key={ex}
              // mousedown would blur the input first, closing this row before the click lands
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setDraft(ex); inputRef.current?.focus(); }}
              style={{
                padding: "6px 11px", borderRadius: R.pill, cursor: "pointer", fontSize: 11.5,
                fontFamily: F.body, whiteSpace: "nowrap", flexShrink: 0,
                border: `1px solid ${C.border}`, background: "transparent", color: C.faint,
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {onMore && canAdd && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onMore({ text: title, kind, listId: parsed.patch.listId || defaultListId, ...parsed.patch }); reset(); }}
          style={{ ...styles.linkBtn, color: C.muted, marginTop: 8 }}
        >
          More options…
        </button>
      )}
    </div>
  );
}
