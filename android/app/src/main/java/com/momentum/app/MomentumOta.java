package com.momentum.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Over-the-air updates for the web half of the app.
 *
 * The app is a web app inside a native shell. A new build of the web half is downloaded from Supabase Storage,
 * every file checked against the hash in its manifest (and, if a public key is built in, the manifest against its
 * signature), staged in a folder of its own, and swapped in the next time the app starts. It is served from the
 * same place and origin as the bundled copy, so what is saved on the phone is untouched.
 *
 * Three guards stand between a bad build and a phone that won't start:
 *  - nothing is used unless every byte matched, so a half-finished or tampered download never gets in;
 *  - a build runs on trial until the web app says it came up (confirm), and a build that fails to come up on
 *    three starts in a row is dropped for the one before it, or for the copy inside the APK, and is never tried again;
 *  - a build older than the one inside the APK is ignored, so reinstalling the app always wins over an old download.
 *
 * Only the web half changes this way. Anything that needs new native code still needs a new APK, which the
 * manifest says by naming the native API level the build needs.
 */
public final class MomentumOta {

    private MomentumOta() { }

    /** What the native half of this APK offers. Must be at least REQUIRES_NATIVE_API in src/lib/nativeApi.js. */
    static final int NATIVE_API = 1;

    static final int MAX_FILES = 400;
    static final long MAX_TOTAL_BYTES = 30L * 1024 * 1024;
    static final long MAX_FILE_BYTES = 12L * 1024 * 1024;
    static final int MAX_TRIAL_STARTS = 2;

    private static final String PREFS = "momentum_ota";
    private static final String CURRENT = "current";
    private static final String PREVIOUS = "previous";
    private static final String PENDING = "pending";
    private static final String TRIAL = "trial";
    private static final String STARTS = "trialStarts";
    private static final String BAD = "bad";
    /** The keys Capacitor itself reads at start-up to decide which folder to serve the web app from. */
    private static final String CAP_PREFS = "CapWebViewSettings";
    private static final String CAP_PATH = "serverBasePath";

    private static final Object LOCK = new Object();
    private static final Pattern SAFE_PATH = Pattern.compile("^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$");
    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9._-]{4,80}$");
    private static final Pattern HEX64 = Pattern.compile("^[0-9a-f]{64}$");
    private static final Pattern ISO = Pattern.compile("^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(\\.\\d{1,9})?Z$");

    /** Why an update was not taken. The code is for the app to react to; the message is for a person. */
    public static final class OtaException extends Exception {
        final String code;

        OtaException(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    static final class Entry {
        final String path;
        final String sha256;
        final long size;

        Entry(String path, String sha256, long size) {
            this.path = path;
            this.sha256 = sha256;
            this.size = size;
        }
    }

    static final class Manifest {
        String id;
        String build;
        int requiresNativeApi;
        String signature;
        final List<Entry> files = new ArrayList<>();

        /** The text that is signed. Must match signingPayload in scripts/ota.mjs byte for byte. */
        String signingPayload() {
            StringBuilder sb = new StringBuilder();
            sb.append("momentum-ota-v1\n").append(id).append('\n').append(build).append('\n').append(requiresNativeApi).append('\n');
            for (Entry e : files) sb.append(e.sha256).append(' ').append(e.size).append(' ').append(e.path).append('\n');
            return sb.toString();
        }
    }

    /** Fetches one file. A seam, so a test can supply the bytes without a network. */
    interface Downloader {
        byte[] get(String url, long maxBytes) throws IOException;
    }

    /** The real one: HTTPS only, no redirects, a size cap, and timeouts. */
    static final class HttpsDownloader implements Downloader {
        @Override
        public byte[] get(String url, long maxBytes) throws IOException {
            if (!url.startsWith("https://")) throw new IOException("only https is allowed: " + url);
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20_000);
            c.setReadTimeout(30_000);
            try {
                if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode() + " for " + url);
                try (InputStream in = c.getInputStream()) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[16 * 1024];
                    long total = 0;
                    for (int n; (n = in.read(buf)) > 0; ) {
                        total += n;
                        if (total > maxBytes) throw new IOException("larger than the " + maxBytes + " bytes allowed: " + url);
                        out.write(buf, 0, n);
                    }
                    return out.toByteArray();
                }
            } finally {
                c.disconnect();
            }
        }
    }

    // ---- reading a manifest ----

    static boolean isSafePath(String p) {
        if (p == null || p.length() > 200 || !SAFE_PATH.matcher(p).matches()) return false;
        for (String seg : p.split("/")) if (seg.equals(".") || seg.equals("..")) return false;
        return true;
    }

    static boolean isIso(String s) {
        return s != null && ISO.matcher(s).matches();
    }

    /** True if build `a` was made after build `b`. Anything that isn't a timestamp is never newer. */
    static boolean isNewer(String a, String b) {
        if (!isIso(a)) return false;
        if (!isIso(b)) return true;
        return pad(a).compareTo(pad(b)) > 0;
    }

    private static String pad(String iso) {
        int dot = iso.indexOf('.');
        String head = dot < 0 ? iso.substring(0, iso.length() - 1) : iso.substring(0, dot);
        String frac = dot < 0 ? "" : iso.substring(dot + 1, iso.length() - 1);
        StringBuilder f = new StringBuilder(frac);
        while (f.length() < 9) f.append('0');
        return head + "." + f;
    }

    /** Reads and checks a manifest. Anything that doesn't look exactly right is refused, not repaired. */
    static Manifest parse(String json) throws OtaException {
        JSONObject o;
        try {
            o = new JSONObject(json);
        } catch (Exception e) {
            throw new OtaException("invalid", "The update's manifest isn't readable.");
        }
        if (!"momentum".equals(o.optString("app"))) throw new OtaException("invalid", "That update isn't for this app.");
        Manifest m = new Manifest();
        m.id = o.optString("id", "");
        m.build = o.optString("build", "");
        m.requiresNativeApi = o.optInt("requiresNativeApi", 0);
        m.signature = o.optString("signature", "");
        if (!SAFE_ID.matcher(m.id).matches()) throw new OtaException("invalid", "The update has no usable id.");
        if (!isIso(m.build)) throw new OtaException("invalid", "The update has no build time.");
        if (m.requiresNativeApi < 1) throw new OtaException("invalid", "The update doesn't say what it needs.");
        JSONArray files = o.optJSONArray("files");
        if (files == null || files.length() == 0) throw new OtaException("invalid", "The update lists no files.");
        if (files.length() > MAX_FILES) throw new OtaException("invalid", "The update lists too many files.");
        long total = 0;
        boolean index = false;
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < files.length(); i++) {
            JSONObject f = files.optJSONObject(i);
            if (f == null) throw new OtaException("invalid", "The update's file list is damaged.");
            String path = f.optString("path", "");
            String hash = f.optString("sha256", "");
            long size = f.optLong("size", -1);
            if (!isSafePath(path)) throw new OtaException("invalid", "The update names a file it may not write: " + path);
            if (!HEX64.matcher(hash).matches()) throw new OtaException("invalid", "A file in the update has no valid checksum: " + path);
            if (size < 0 || size > MAX_FILE_BYTES) throw new OtaException("invalid", "A file in the update has an impossible size: " + path);
            if (!seen.add(path)) throw new OtaException("invalid", "The update lists a file twice: " + path);
            total += size;
            if (path.equals("index.html")) index = true;
            m.files.add(new Entry(path, hash, size));
        }
        if (total > MAX_TOTAL_BYTES) throw new OtaException("invalid", "The update is larger than an update may be.");
        if (!index) throw new OtaException("invalid", "The update has no index.html.");
        return m;
    }

    // ---- trust ----

    /** True if the signature on the manifest was made by the holder of the matching private key. */
    static boolean verifySignature(Manifest m, String publicKeyBase64) {
        try {
            byte[] der = Base64.decode(publicKeyBase64.trim(), Base64.DEFAULT);
            PublicKey key = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(der));
            Signature s = Signature.getInstance("SHA256withECDSA");
            s.initVerify(key);
            s.update(m.signingPayload().getBytes("UTF-8"));
            return s.verify(Base64.decode(m.signature, Base64.DEFAULT));
        } catch (Exception e) {
            return false;
        }
    }

    /** The public key built into this APK, or null if none: then updates are accepted on their hashes alone. */
    static String publicKey(Context context) {
        try (InputStream in = context.getAssets().open("ota-public-key.txt")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[1024];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            String key = out.toString("UTF-8").trim();
            return key.isEmpty() ? null : key;
        } catch (Exception e) {
            return null;
        }
    }

    // ---- where things are ----

    static File root(Context context) {
        return new File(context.getFilesDir(), "ota");
    }

    static File dirOf(Context context, String id) {
        return new File(root(context), id);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean validBundle(File dir) {
        return dir != null && dir.isDirectory() && new File(dir, "index.html").isFile();
    }

    private static String readText(File f) {
        try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[1024];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) {
            return null;
        }
    }

    /** The build stamp of a bundle on disk, or null. */
    static String buildOf(File dir) {
        String text = dir == null ? null : readText(new File(dir, "build.json"));
        if (text == null) return null;
        try {
            return new JSONObject(text).optString("build", null);
        } catch (Exception e) {
            return null;
        }
    }

    /** The build stamp of the web app inside this APK. */
    static String bundledBuild(Context context) {
        try (InputStream in = context.getAssets().open("public/build.json")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[1024];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return new JSONObject(out.toString("UTF-8")).optString("build", null);
        } catch (Exception e) {
            return null;
        }
    }

    // ---- bookkeeping ----

    static Set<String> badBuilds(Context context) {
        return new HashSet<>(prefs(context).getStringSet(BAD, new HashSet<>()));
    }

    static String current(Context context) {
        return prefs(context).getString(CURRENT, null);
    }

    static String pending(Context context) {
        return prefs(context).getString(PENDING, null);
    }

    static boolean onTrial(Context context) {
        return prefs(context).getString(TRIAL, null) != null;
    }

    private static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    /** Removes every downloaded build that is neither in use, the one before it, nor waiting. */
    static void tidy(Context context) {
        SharedPreferences p = prefs(context);
        Set<String> keep = new HashSet<>();
        for (String k : new String[] { CURRENT, PREVIOUS, PENDING }) {
            String v = p.getString(k, null);
            if (v != null) keep.add(v);
        }
        File[] dirs = root(context).listFiles();
        if (dirs == null) return;
        for (File d : dirs) if (!keep.contains(d.getName())) deleteTree(d);
    }

    // ---- installing ----

    /**
     * Downloads the build into a staging folder, checks every file, moves it into place, and marks it as the
     * one to use at the next start. Throws OtaException, and leaves nothing behind, if anything is wrong.
     */
    static String install(Context context, Manifest m, String baseUrl, Downloader dl, String publicKey, String bundledBuild) throws OtaException {
        if (baseUrl == null || !baseUrl.startsWith("https://")) throw new OtaException("invalid", "Updates only come over https.");
        if (m.requiresNativeApi > NATIVE_API) {
            throw new OtaException("needs-native", "This update needs a newer version of the app itself. Install the new APK first.");
        }
        if (publicKey != null && (m.signature == null || m.signature.isEmpty() || !verifySignature(m, publicKey))) {
            throw new OtaException("signature", "This update isn't signed by you, so it was not installed.");
        }
        synchronized (LOCK) {
            if (badBuilds(context).contains(m.id)) throw new OtaException("bad-build", "That build failed to start before, so it won't be tried again.");
            String cur = current(context);
            String runningBuild = cur != null ? buildOf(dirOf(context, cur)) : null;
            if (!isNewer(m.build, bundledBuild) || (runningBuild != null && !isNewer(m.build, runningBuild))) {
                throw new OtaException("not-newer", "That update isn't newer than the app already has.");
            }
        }
        File root = root(context);
        File stage = new File(root, ".stage-" + m.id);
        File finalDir = dirOf(context, m.id);
        deleteTree(stage);
        if (!stage.mkdirs() && !stage.isDirectory()) throw new OtaException("download", "Couldn't make room for the update.");
        String base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        try {
            String stageCanon = stage.getCanonicalPath() + File.separator;
            for (Entry e : m.files) {
                byte[] bytes = dl.get(base + e.path, Math.max(e.size, 1) + 1);
                if (bytes.length != e.size) throw new OtaException("download", "A file arrived the wrong size: " + e.path);
                if (!sha256(bytes).equals(e.sha256)) throw new OtaException("download", "A file didn't match its checksum: " + e.path);
                File out = new File(stage, e.path);
                if (!out.getCanonicalPath().startsWith(stageCanon)) throw new OtaException("invalid", "A file would have been written outside its folder: " + e.path);
                File parent = out.getParentFile();
                if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new OtaException("download", "Couldn't save " + e.path);
                try (FileOutputStream fos = new FileOutputStream(out)) {
                    fos.write(bytes);
                    fos.getFD().sync();
                }
            }
            if (!validBundle(stage)) throw new OtaException("invalid", "The update came without an index.html.");
            synchronized (LOCK) {
                deleteTree(finalDir);
                if (!stage.renameTo(finalDir)) throw new OtaException("download", "Couldn't put the update in place.");
                prefs(context).edit().putString(PENDING, m.id).commit();
                tidy(context);
            }
        } catch (IOException e) {
            deleteTree(stage);
            throw new OtaException("download", "The download failed: " + e.getMessage());
        } catch (OtaException e) {
            deleteTree(stage);
            throw e;
        } catch (RuntimeException e) {
            deleteTree(stage);
            throw new OtaException("download", "The update couldn't be installed: " + e.getMessage());
        }
        return m.id;
    }

    static String sha256(byte[] bytes) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // ---- the old service worker ----

    /**
     * The web app used to register a service worker inside the app, and one that is still there would keep serving
     * the build it cached instead of the one that is installed. The web app now removes any it finds, but only once it
     * is running, and a cached worker would get in the way of that first run. So, once, before the web view exists, the
     * worker's files are deleted outright.
     */
    static void clearServiceWorkerOnce(Context context) {
        SharedPreferences p = prefs(context);
        if (p.getBoolean("swCleared", false)) return;
        File data = context.getDataDir();
        deleteTree(new File(data, "app_webview/Default/Service Worker"));
        p.edit().putBoolean("swCleared", true).commit();
    }

    // ---- starting up ----

    /**
     * Decides which build to start with, and tells Capacitor. Called before the web view is created, every time the app
     * starts. Moves a freshly downloaded build to the front and puts it on trial, takes a build that keeps failing to
     * start off trial and out of use, and drops anything older than the web app inside the APK.
     * Returns the folder to serve, or null to serve the copy in the APK.
     */
    static String resolveAtStartup(Context context, String bundledBuild) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(context);
            Set<String> bad = new HashSet<>(p.getStringSet(BAD, new HashSet<>()));
            String current = p.getString(CURRENT, null);
            String previous = p.getString(PREVIOUS, null);
            String pending = p.getString(PENDING, null);
            String trial = p.getString(TRIAL, null);
            int starts = p.getInt(STARTS, 0);

            if (pending != null) {
                if (validBundle(dirOf(context, pending)) && !bad.contains(pending)) {
                    previous = current;
                    current = pending;
                    trial = pending;
                    starts = 0;
                }
                pending = null;
            }
            if (trial != null && trial.equals(current)) {
                starts++;
                if (starts > MAX_TRIAL_STARTS) {
                    // It never came up, three times running.
                    bad.add(current);
                    current = previous;
                    previous = null;
                    trial = null;
                    starts = 0;
                }
            }
            if (current != null) {
                File dir = dirOf(context, current);
                String build = buildOf(dir);
                // A new APK carries a newer web app than an old download: the APK wins.
                if (!validBundle(dir) || bad.contains(current) || (build != null && !isNewer(build, bundledBuild))) {
                    current = null;
                    trial = null;
                    starts = 0;
                }
            }
            p.edit().putString(CURRENT, current).putString(PREVIOUS, previous).putString(PENDING, pending)
                    .putString(TRIAL, trial).putInt(STARTS, starts).putStringSet(BAD, bad).commit();
            tidy(context);
            String path = current == null ? null : dirOf(context, current).getAbsolutePath();
            context.getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit().putString(CAP_PATH, path == null ? "" : path).commit();
            return path;
        }
    }

    /** The web app is up: the build on trial is good. */
    static void confirm(Context context) {
        synchronized (LOCK) {
            prefs(context).edit().remove(TRIAL).putInt(STARTS, 0).commit();
        }
    }

    static JSONObject info(Context context, String bundledBuild) {
        JSONObject o = new JSONObject();
        try {
            String cur = current(context);
            o.put("nativeApi", NATIVE_API);
            o.put("bundledBuild", bundledBuild == null ? JSONObject.NULL : bundledBuild);
            o.put("current", cur == null ? JSONObject.NULL : cur);
            o.put("currentBuild", cur == null ? JSONObject.NULL : buildOf(dirOf(context, cur)));
            o.put("pending", pending(context) == null ? JSONObject.NULL : pending(context));
            o.put("onTrial", onTrial(context));
            o.put("signed", publicKey(context) != null);
        } catch (Exception ignored) { }
        return o;
    }
}
