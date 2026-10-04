// Getting a file out of the app.
//
// In a browser, making a link and clicking it downloads a file. Inside the Android app's web view
// that does nothing at all — there is no download handler — and the first backup button was built
// on exactly that: it reported "Saved to your downloads" and wrote nothing anywhere, which was
// found when a backup couldn't be found. On the phone these calls go to a small native plugin
// (MomentumFiles) that writes into the real Downloads folder, and only report success when it did.
const plugin = () => (typeof window !== "undefined" ? window.Capacitor?.Plugins?.MomentumFiles : null);

/** True inside the Android app, where saving has to go through the native plugin. */
export const hasNativeFiles = () => !!plugin()?.save;
/** The share sheet — to send a file to Drive, email, a chat. Only the app has one to offer. */
export const canShareFiles = () => !!plugin()?.share;

// An error with no message stringifies as just "Error", which tells nobody anything.
const messageOf = (e) => {
  const text = String(e?.message ?? e ?? "").trim();
  return text && !/^(\w*Error)?$/.test(text) ? text : "unknown error";
};

function browserDownload(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Saves text as a file. Resolves to { ok, via, name, location } — name and location are where it
 * really went, since the phone may rename a file rather than overwrite one — or { ok: false,
 * error }. Never throws, and never says ok for a save that didn't happen.
 */
export async function saveFile(filename, text, mime = "text/plain") {
  const p = plugin();
  if (p?.save) {
    try {
      const r = await p.save({ filename, text, mime });
      if (!r?.name) return { ok: false, via: "native", error: "the phone didn't say where it saved it" };
      return { ok: true, via: "native", name: r.name, location: r.location || "Downloads" };
    } catch (e) {
      return { ok: false, via: "native", error: messageOf(e) };
    }
  }
  try {
    browserDownload(filename, text, mime);
    return { ok: true, via: "browser", name: filename, location: "your downloads" };
  } catch (e) {
    return { ok: false, via: "browser", error: messageOf(e) };
  }
}

/** Opens the phone's share sheet with the file attached. */
export async function shareFile(filename, text, mime = "text/plain") {
  const p = plugin();
  if (!p?.share) return { ok: false, error: "sharing isn't available here" };
  try {
    await p.share({ filename, text, mime });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/** The sentence for a result — the same wording wherever a file is saved. */
export const describeSave = (result, what = "File") =>
  result.ok
    ? `${what} saved: ${result.name} in ${result.location}`
    : `Couldn't save ${what.toLowerCase()}: ${result.error}`;

/**
 * Tells the person how it went, from anywhere in the app, without each caller needing a toast of
 * its own. Momentum listens for this and shows it.
 */
export function announce(result, what) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  try {
    window.dispatchEvent(new CustomEvent("momentum:toast", { detail: describeSave(result, what) }));
  } catch { /* nothing to tell it to */ }
}
