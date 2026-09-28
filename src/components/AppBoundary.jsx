import React from "react";
import { C, F, styles } from "../theme.js";

// The last line of defence. Without it, any error React can't place — the first real-phone
// build threw one from a notification listener straight after starting — removes the whole
// app and leaves a blank screen with nothing to go on. With it, the error is on the screen,
// in words a screenshot can carry.
//
// Nothing is lost when this shows. Saving happens only when the app's state changes, and a
// crash changes nothing, so whatever was saved before is still there after a reload.
export default class AppBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const where = info?.componentStack?.split("\n").filter(Boolean).slice(0, 3).join(" ‹ ") || "";
    // Same prefix as the startup marks, so the Android system log shows it among them.
    console.error(`[momentum] crashed: ${error?.message || error} ${where}`);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{
        minHeight: "100vh", background: C.bg, color: C.text, display: "flex", flexDirection: "column",
        justifyContent: "center", padding: 24, boxSizing: "border-box", fontFamily: F.body,
      }}>
        <h1 style={{ fontFamily: F.display, fontSize: 24, margin: "0 0 8px" }}>Momentum hit a problem</h1>
        <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 16px" }}>
          Your data is safe — nothing is saved while this screen is up, so reloading picks up
          exactly where you were. A screenshot of the box below is enough to fix it.
        </p>
        <p style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 13px",
          color: C.faint, fontFamily: "monospace", fontSize: 11.5, lineHeight: 1.55, margin: "0 0 16px",
          wordBreak: "break-word",
        }}>
          {String(error?.message || error)}
          <br />
          {(error?.stack || "").split("\n").slice(1, 3).join(" ")}
        </p>
        <button onClick={() => window.location.reload()} style={styles.cta}>Reload</button>
      </div>
    );
  }
}
