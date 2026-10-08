// What may and may not be baked into the app. The anon key is public by design; the service role key
// bypasses every access rule, so one that ends up in a build — which anyone can download — hands the whole
// project to whoever opens the file. Shared by the app and the build so both refuse it.

const decode = (part) => {
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
  } catch { return null; }
};

/** Why this key must not be used as the app's key, or null if it is fine. */
export function keyProblem(key) {
  const k = String(key || "").trim();
  if (!k) return null;
  if (/^sb_secret_/.test(k)) return "That is a secret key. The app only ever takes the public one (anon, or publishable).";
  const parts = k.split(".");
  if (parts.length === 3) {
    const role = decode(parts[1])?.role;
    if (role === "service_role") return "That is the service role key, which bypasses every access rule. The app only ever takes the anon (public) key.";
  }
  return null;
}
