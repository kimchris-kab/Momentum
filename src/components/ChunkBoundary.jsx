import React from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { C, styles } from "../theme.js";

// Splitting the app into chunks means a view can now fail to arrive — a dropped connection
// mid-tap, a stale page against a redeployed build. Without a boundary React unmounts the
// whole tree when that happens, and a white screen is a far worse failure than the second
// of loading the split was meant to save.
export default class ChunkBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev) {
    // A different view is a different chunk, so it gets a clean try rather than inheriting
    // the last one's failure.
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ ...styles.page, paddingTop: 60 }}>
        <div style={{ textAlign: "center", color: C.muted }}>
          <WifiOff size={26} color={C.faint} />
          <p style={{ color: C.text, fontSize: 15, fontWeight: 600, margin: "14px 0 6px" }}>
            That part didn't load
          </p>
          <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.6, margin: "0 0 18px" }}>
            Nothing is lost — everything you've logged is still here on this device. Once a
            browser has failed to fetch part of an app it won't try that part again, so this
            one needs a reload. The other screens still work in the meantime.
          </p>
          <button onClick={() => window.location.reload()} style={{ ...styles.ghostCta, height: 44 }}>
            <RefreshCw size={15} /> Reload the app
          </button>
        </div>
      </div>
    );
  }
}
