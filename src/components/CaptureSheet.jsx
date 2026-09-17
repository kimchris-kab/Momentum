import React from "react";
import { C } from "../theme.js";
import QuickAdd from "./QuickAdd.jsx";
import { Sheet } from "./ui.jsx";

// What the + button opens. The old behaviour created a blank task and dropped you into the
// full editor — eight fields for something you already knew how to say in one line. This
// captures the line and gets out of the way, with "More options…" still there when a task
// genuinely needs the editor.
export default function CaptureSheet({ open, lists, onClose, onAdd, onAddAndEdit }) {
  if (!open) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Quick add">
      <QuickAdd
        lists={lists}
        autoFocus
        placeholder="Gym 3x a week @health"
        onAdd={(patch) => { onAdd(patch); onClose(); }}
        onMore={(patch) => { onAddAndEdit(patch); onClose(); }}
      />
      <p style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.55, margin: "14px 0 0" }}>
        Dates, times, repeats, priority, lists and pillars can all go in the line. Whatever
        it reads shows as a chip first — tap the × on one to keep those words in the title.
      </p>
    </Sheet>
  );
}
