package com.momentum.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * The over-the-air installer on a real Android: every way a download can go wrong, and the start-up logic
 * that keeps a phone from being stranded on a build that won't run.
 *
 * Nothing here touches a network. Files come from a map; the real downloader is only checked for what it
 * refuses. The signature check is run against a vector made by the Node publisher, so what is proved is that
 * the two languages agree on the bytes that are signed — not just that Java agrees with itself.
 */
@RunWith(AndroidJUnit4.class)
public class OtaTest {

    private static final String BASE = "https://example.supabase.co/storage/v1/object/public/app/ota/x/";
    private static final String OLD_APK = "2026-10-08T05:31:46.351Z";

    private Context context;
    private JSONObject vector;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        wipe();
        vector = new JSONObject(readAsset("ota-vector.json"));
    }

    @After
    public void tearDown() {
        wipe();
    }

    private void wipe() {
        context.getSharedPreferences("momentum_ota", Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences("CapWebViewSettings", Context.MODE_PRIVATE).edit().remove("serverBasePath").commit();
        deleteTree(MomentumOta.root(context));
    }

    private static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    /** Reads a file from the test APK's own assets, not the app's. */
    private String readAsset(String name) throws IOException {
        try (InputStream in = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[1024];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    // ---- a build to install ------------------------------------------------------------------

    /** A manifest and the bytes of its files, built here rather than read, so each test can spoil one thing. */
    private static final class Build {
        final JSONObject manifest = new JSONObject();
        final Map<String, byte[]> bytes = new HashMap<>();
        final JSONArray files = new JSONArray();

        Build(String id, String buildTime) throws Exception {
            manifest.put("app", "momentum").put("id", id).put("build", buildTime).put("requiresNativeApi", 1).put("files", files);
            add("index.html", "<html>" + id + "</html>");
            add("build.json", "{\"build\":\"" + buildTime + "\"}");
            add("assets/app-AbCdEf12.js", "console.log('" + id + "')");
        }

        Build add(String path, String content) throws Exception {
            byte[] b = content.getBytes(StandardCharsets.UTF_8);
            bytes.put(path, b);
            files.put(new JSONObject().put("path", path).put("sha256", MomentumOta.sha256(b)).put("size", b.length));
            return this;
        }

        MomentumOta.Manifest parsed() throws Exception {
            return MomentumOta.parse(manifest.toString());
        }

        MomentumOta.Downloader downloader() {
            return (url, max) -> {
                String path = url.substring(BASE.length());
                byte[] b = bytes.get(path);
                if (b == null) throw new IOException("404 " + path);
                return b;
            };
        }
    }

    private String install(Build b, String publicKey, String apkBuild) throws Exception {
        return MomentumOta.install(context, b.parsed(), BASE, b.downloader(), publicKey, apkBuild);
    }

    private void expect(String code, MomentumOta.Downloader dl, Build b, String publicKey, String apkBuild) throws Exception {
        try {
            MomentumOta.install(context, b.parsed(), BASE, dl, publicKey, apkBuild);
            fail("expected " + code);
        } catch (MomentumOta.OtaException e) {
            assertEquals(e.getMessage(), code, e.code);
        }
    }

    private String contentOf(String id, String path) throws Exception {
        File f = new File(MomentumOta.dirOf(context, id), path);
        try (InputStream in = new java.io.FileInputStream(f)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[1024];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    // ---- reading a manifest ------------------------------------------------------------------

    @Test
    public void aGoodManifestIsAccepted() throws Exception {
        MomentumOta.Manifest m = new Build("20990101-000000Z-good", "2099-01-01T00:00:00.000Z").parsed();
        assertEquals("20990101-000000Z-good", m.id);
        assertEquals(3, m.files.size());
        assertEquals(1, m.requiresNativeApi);
    }

    private void refuses(String why, Build b) throws Exception {
        try {
            b.parsed();
            fail("should have refused: " + why);
        } catch (MomentumOta.OtaException e) {
            assertEquals(why, "invalid", e.code);
        }
    }

    @Test
    public void aManifestThatCouldHarmThePhoneIsRefused() throws Exception {
        Build base = new Build("20990101-000000Z-evil", "2099-01-01T00:00:00.000Z");
        refuses("climbing out of the folder", new Build("20990101-000000Z-evil", "2099-01-01T00:00:00.000Z").add("../../evil.js", "x"));
        refuses("climbing out part way", new Build("20990101-000000Z-evil", "2099-01-01T00:00:00.000Z").add("a/../../evil.js", "x"));
        refuses("an absolute path", new Build("20990101-000000Z-evil", "2099-01-01T00:00:00.000Z").add("/data/data/x", "x"));
        refuses("a backslash", new Build("20990101-000000Z-evil", "2099-01-01T00:00:00.000Z").add("a\\b.js", "x"));
        refuses("a space", new Build("20990101-000000Z-evil", "2099-01-01T00:00:00.000Z").add("a b.js", "x"));
        refuses("an empty segment", new Build("20990101-000000Z-evil", "2099-01-01T00:00:00.000Z").add("a//b.js", "x"));
        refuses("a file listed twice", new Build("20990101-000000Z-evil", "2099-01-01T00:00:00.000Z").add("index.html", "again"));

        JSONObject m = base.manifest;
        m.put("app", "other");
        refuses("another app's update", base);
        m.put("app", "momentum").put("id", "../escape");
        refuses("an id that is a path", base);
        m.put("id", "ab");
        refuses("an id too short to be one", base);
        m.put("id", "20990101-000000Z-evil").put("build", "yesterday");
        refuses("a build that isn't a time", base);
        m.put("build", "2099-01-01T00:00:00.000Z").put("requiresNativeApi", 0);
        refuses("an update that doesn't say what it needs", base);
        m.put("requiresNativeApi", 1).put("files", new JSONArray());
        refuses("no files", base);
        m.put("files", new JSONArray().put(new JSONObject().put("path", "a.js").put("sha256", "zz").put("size", 1)));
        refuses("a checksum that isn't one", base);
        m.put("files", new JSONArray().put(new JSONObject().put("path", "index.html").put("sha256", "A".repeat(64)).put("size", 1)));
        refuses("an upper-case checksum, which the publisher never writes", base);
        m.put("files", new JSONArray().put(new JSONObject().put("path", "index.html").put("sha256", "a".repeat(64)).put("size", -1)));
        refuses("a negative size", base);
        m.put("files", new JSONArray().put(new JSONObject().put("path", "index.html").put("sha256", "a".repeat(64)).put("size", MomentumOta.MAX_FILE_BYTES + 1)));
        refuses("a single enormous file", base);
        m.put("files", new JSONArray().put(new JSONObject().put("path", "a.js").put("sha256", "a".repeat(64)).put("size", 1)));
        refuses("a build with no index.html", base);
        try {
            MomentumOta.parse("{not json");
            fail();
        } catch (MomentumOta.OtaException e) {
            assertEquals("invalid", e.code);
        }
    }

    @Test
    public void tooManyFilesOrTooManyBytesIsRefused() throws Exception {
        Build many = new Build("20990101-000000Z-many", "2099-01-01T00:00:00.000Z");
        for (int i = 0; i < MomentumOta.MAX_FILES; i++) many.add("f" + i + ".js", "x");
        refuses("more than the limit", many);
        Build big = new Build("20990101-000000Z-big", "2099-01-01T00:00:00.000Z");
        JSONArray files = new JSONArray();
        files.put(new JSONObject().put("path", "index.html").put("sha256", "a".repeat(64)).put("size", 10L * 1024 * 1024));
        files.put(new JSONObject().put("path", "b.js").put("sha256", "a".repeat(64)).put("size", 10L * 1024 * 1024));
        files.put(new JSONObject().put("path", "c.js").put("sha256", "a".repeat(64)).put("size", 11L * 1024 * 1024));
        big.manifest.put("files", files);
        refuses("more bytes in total than an update may carry", big);
    }

    @Test
    public void buildTimesCompareLikeTimes() {
        assertTrue(MomentumOta.isNewer("2026-10-09T00:00:00.000Z", "2026-10-08T23:59:59.999Z"));
        assertFalse(MomentumOta.isNewer("2026-10-08T05:31:46.351Z", "2026-10-08T05:31:46.351Z"));
        assertFalse("older", MomentumOta.isNewer("2026-10-08T05:31:46.350Z", "2026-10-08T05:31:46.351Z"));
        assertTrue("with and without fractions", MomentumOta.isNewer("2026-10-08T05:31:46.5Z", "2026-10-08T05:31:46Z"));
        assertTrue(MomentumOta.isNewer("2026-10-08T05:31:46.350Z", "2026-10-08T05:31:46.35Z") == false);
        assertFalse("not a time is never newer", MomentumOta.isNewer("later", "2026-10-08T05:31:46.351Z"));
        assertFalse(MomentumOta.isNewer(null, "2026-10-08T05:31:46.351Z"));
        assertTrue("anything real beats nothing at all", MomentumOta.isNewer("2026-10-08T05:31:46.351Z", null));
    }

    // ---- trust: the signature, checked against what Node made --------------------------------

    @Test
    public void aSignatureMadeByTheNodePublisherIsAcceptedHere() throws Exception {
        MomentumOta.Manifest m = MomentumOta.parse(vector.getJSONObject("manifest").toString());
        assertTrue("Node and Java agree on the signed bytes", MomentumOta.verifySignature(m, vector.getString("publicKey")));
        assertTrue(m.signingPayload(), m.signingPayload().startsWith("momentum-ota-v1\n20990101-000000Z-vector\n2099-01-01T00:00:00.000Z\n1\n"));
    }

    @Test
    public void anyChangeToASignedManifestBreaksIt() throws Exception {
        String key = vector.getString("publicKey");
        JSONObject j = new JSONObject(vector.getJSONObject("manifest").toString());
        j.getJSONArray("files").getJSONObject(0).put("sha256", "0".repeat(64));
        assertFalse("a changed hash", MomentumOta.verifySignature(MomentumOta.parse(j.toString()), key));
        j = new JSONObject(vector.getJSONObject("manifest").toString());
        j.getJSONArray("files").getJSONObject(0).put("path", "assets/other.js");
        assertFalse("a renamed file", MomentumOta.verifySignature(MomentumOta.parse(j.toString()), key));
        j = new JSONObject(vector.getJSONObject("manifest").toString());
        j.put("requiresNativeApi", 5);
        assertFalse("a different claim about what it needs", MomentumOta.verifySignature(MomentumOta.parse(j.toString()), key));
        j = new JSONObject(vector.getJSONObject("manifest").toString());
        j.put("id", "20990101-000000Z-other");
        assertFalse("another id", MomentumOta.verifySignature(MomentumOta.parse(j.toString()), key));
        j = new JSONObject(vector.getJSONObject("manifest").toString());
        j.put("notes", "edited");
        assertTrue("notes are not signed, as documented", MomentumOta.verifySignature(MomentumOta.parse(j.toString()), key));
    }

    @Test
    public void aWrongOrBrokenKeyOrSignatureIsNotAccepted() throws Exception {
        MomentumOta.Manifest m = MomentumOta.parse(vector.getJSONObject("manifest").toString());
        assertFalse("not a key", MomentumOta.verifySignature(m, "not a key"));
        assertFalse("empty", MomentumOta.verifySignature(m, ""));
        m.signature = "###";
        assertFalse("not a signature", MomentumOta.verifySignature(m, vector.getString("publicKey")));
        m.signature = "";
        assertFalse("no signature", MomentumOta.verifySignature(m, vector.getString("publicKey")));
    }

    private Build vectorBuild() throws Exception {
        Build b = new Build("x", "2099-01-01T00:00:00.000Z");
        // Replace the generated manifest and files with the signed vector's.
        b.bytes.clear();
        JSONObject contents = vector.getJSONObject("contents");
        for (java.util.Iterator<String> it = contents.keys(); it.hasNext(); ) {
            String path = it.next();
            b.bytes.put(path, contents.getString(path).getBytes(StandardCharsets.UTF_8));
        }
        return b;
    }

    private void installVector(String publicKey) throws Exception {
        MomentumOta.Manifest m = MomentumOta.parse(vector.getJSONObject("manifest").toString());
        Build b = vectorBuild();
        MomentumOta.install(context, m, BASE, b.downloader(), publicKey, OLD_APK);
    }

    @Test
    public void withAKeyBuiltInASignedUpdateInstalls() throws Exception {
        installVector(vector.getString("publicKey"));
        assertEquals("20990101-000000Z-vector", MomentumOta.pending(context));
        assertEquals("console.log('hello')", contentOf("20990101-000000Z-vector", "assets/app-AbCdEf12.js"));
    }

    @Test
    public void withAKeyBuiltInAnUnsignedOrOtherwiseSignedUpdateIsRefused() throws Exception {
        try {
            installVector("MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE" + "A".repeat(86) + "==");
            fail("a different key must not accept it");
        } catch (MomentumOta.OtaException e) {
            assertEquals("signature", e.code);
        }
        Build unsigned = new Build("20990101-000000Z-unsigned", "2099-01-01T00:00:00.000Z");
        expect("signature", unsigned.downloader(), unsigned, vector.getString("publicKey"), OLD_APK);
        assertNull("nothing was left waiting", MomentumOta.pending(context));
        assertFalse(MomentumOta.dirOf(context, "20990101-000000Z-unsigned").exists());
    }

    @Test
    public void withNoKeyBuiltInHashesAloneAreTrusted() throws Exception {
        Build b = new Build("20990101-000000Z-nokey", "2099-01-01T00:00:00.000Z");
        assertEquals("20990101-000000Z-nokey", install(b, null, OLD_APK));
    }

    // ---- installing --------------------------------------------------------------------------

    @Test
    public void aGoodBuildIsWrittenWhereItShouldBeAndWaitsForTheNextStart() throws Exception {
        Build b = new Build("20990101-000000Z-good", "2099-01-01T00:00:00.000Z");
        assertEquals("20990101-000000Z-good", install(b, null, OLD_APK));
        assertEquals("<html>20990101-000000Z-good</html>", contentOf("20990101-000000Z-good", "index.html"));
        assertEquals("nested files too", "console.log('20990101-000000Z-good')", contentOf("20990101-000000Z-good", "assets/app-AbCdEf12.js"));
        assertEquals("it's waiting, not in use", "20990101-000000Z-good", MomentumOta.pending(context));
        assertNull(MomentumOta.current(context));
        File[] left = MomentumOta.root(context).listFiles();
        assertEquals("only the finished folder, no staging left behind", 1, left.length);
    }

    @Test
    public void aFileThatDoesNotMatchItsChecksumStopsEverythingAndLeavesNothing() throws Exception {
        Build b = new Build("20990101-000000Z-bad", "2099-01-01T00:00:00.000Z");
        b.bytes.put("assets/app-AbCdEf12.js", "console.log('tampered')".getBytes(StandardCharsets.UTF_8));
        // Same length, different bytes: the size check passes, the hash must catch it.
        byte[] same = new byte[b.bytes.get("assets/app-AbCdEf12.js").length];
        java.util.Arrays.fill(same, (byte) 'x');
        b.bytes.put("assets/app-AbCdEf12.js", same);
        JSONObject f = b.files.getJSONObject(2);
        f.put("size", same.length);
        expect("download", b.downloader(), b, null, OLD_APK);
        assertFalse(MomentumOta.dirOf(context, "20990101-000000Z-bad").exists());
        assertNull(MomentumOta.pending(context));
        File[] left = MomentumOta.root(context).listFiles();
        assertTrue("no half-finished staging folder", left == null || left.length == 0);
    }

    @Test
    public void aFileOfTheWrongSizeIsCaught() throws Exception {
        Build b = new Build("20990101-000000Z-size", "2099-01-01T00:00:00.000Z");
        b.bytes.put("index.html", "short".getBytes(StandardCharsets.UTF_8));
        expect("download", b.downloader(), b, null, OLD_APK);
        assertNull(MomentumOta.pending(context));
    }

    @Test
    public void aDownloadThatFailsPartWayLeavesNothingAndKeepsWhatWasThere() throws Exception {
        Build good = new Build("20990101-000000Z-first", "2099-01-01T00:00:00.000Z");
        install(good, null, OLD_APK);
        Build b = new Build("20990102-000000Z-second", "2099-01-02T00:00:00.000Z");
        b.bytes.remove("assets/app-AbCdEf12.js");
        expect("download", b.downloader(), b, null, OLD_APK);
        assertEquals("the earlier one is still waiting", "20990101-000000Z-first", MomentumOta.pending(context));
        assertTrue(MomentumOta.validBundle(MomentumOta.dirOf(context, "20990101-000000Z-first")));
        assertFalse(MomentumOta.dirOf(context, "20990102-000000Z-second").exists());
    }

    @Test
    public void onlyHttpsIsAllowed() throws Exception {
        Build b = new Build("20990101-000000Z-http", "2099-01-01T00:00:00.000Z");
        try {
            MomentumOta.install(context, b.parsed(), "http://example.com/ota/x/", b.downloader(), null, OLD_APK);
            fail();
        } catch (MomentumOta.OtaException e) {
            assertEquals("invalid", e.code);
        }
        try {
            new MomentumOta.HttpsDownloader().get("http://example.com/x", 100);
            fail("the real downloader must refuse cleartext too");
        } catch (IOException e) {
            assertTrue(e.getMessage(), e.getMessage().contains("https"));
        }
    }

    @Test
    public void anUpdateThatNeedsANewerAppThanThisIsNotTaken() throws Exception {
        Build b = new Build("20990101-000000Z-future", "2099-01-01T00:00:00.000Z");
        b.manifest.put("requiresNativeApi", MomentumOta.NATIVE_API + 1);
        expect("needs-native", b.downloader(), b, null, OLD_APK);
        assertNull(MomentumOta.pending(context));
    }

    @Test
    public void anUpdateNoNewerThanTheAppIsNotTaken() throws Exception {
        Build b = new Build("20260101-000000Z-old", "2026-01-01T00:00:00.000Z");
        expect("not-newer", b.downloader(), b, null, OLD_APK);
        Build same = new Build("20261008-053146Z-same", OLD_APK);
        expect("not-newer", same.downloader(), same, null, OLD_APK);
    }

    @Test
    public void aBuildNoNewerThanTheOneAlreadyRunningIsNotTaken() throws Exception {
        install(new Build("20990201-000000Z-newer", "2099-02-01T00:00:00.000Z"), null, OLD_APK);
        MomentumOta.resolveAtStartup(context, OLD_APK);
        Build older = new Build("20990101-000000Z-older", "2099-01-01T00:00:00.000Z");
        expect("not-newer", older.downloader(), older, null, OLD_APK);
    }

    // ---- starting up -------------------------------------------------------------------------

    private String capPath() {
        return context.getSharedPreferences("CapWebViewSettings", Context.MODE_PRIVATE).getString("serverBasePath", null);
    }

    @Test
    public void aWaitingBuildIsUsedAtTheNextStartAndPutOnTrial() throws Exception {
        install(new Build("20990101-000000Z-one", "2099-01-01T00:00:00.000Z"), null, OLD_APK);
        String path = MomentumOta.resolveAtStartup(context, OLD_APK);
        assertNotNull(path);
        assertTrue(path, path.endsWith("/ota/20990101-000000Z-one"));
        assertEquals("Capacitor is told to serve it", path, capPath());
        assertEquals("20990101-000000Z-one", MomentumOta.current(context));
        assertNull("nothing waiting any more", MomentumOta.pending(context));
        assertTrue("and it's on trial", MomentumOta.onTrial(context));
        MomentumOta.confirm(context);
        assertFalse("until the web app says it came up", MomentumOta.onTrial(context));
        assertEquals("a later start keeps using it", path, MomentumOta.resolveAtStartup(context, OLD_APK));
        assertFalse(MomentumOta.onTrial(context));
    }

    @Test
    public void withNothingDownloadedTheCopyInsideTheApkIsServed() {
        assertNull(MomentumOta.resolveAtStartup(context, OLD_APK));
        assertEquals("an empty path means Capacitor serves its own", "", capPath());
    }

    @Test
    public void aBuildThatKeepsFailingToStartIsDroppedForTheOneBeforeIt() throws Exception {
        install(new Build("20990101-000000Z-good", "2099-01-01T00:00:00.000Z"), null, OLD_APK);
        MomentumOta.resolveAtStartup(context, OLD_APK);
        MomentumOta.confirm(context);                      // the first build ran fine

        install(new Build("20990201-000000Z-broken", "2099-02-01T00:00:00.000Z"), null, OLD_APK);
        String path = MomentumOta.resolveAtStartup(context, OLD_APK);       // start 1 of the broken one
        assertTrue(path, path.endsWith("-broken"));
        assertTrue(MomentumOta.resolveAtStartup(context, OLD_APK).endsWith("-broken"));  // start 2, never confirmed
        String third = MomentumOta.resolveAtStartup(context, OLD_APK);                   // start 3: given up on
        assertTrue("back to the one that worked: " + third, third.endsWith("-good"));
        assertEquals(third, capPath());
        assertTrue("and never tried again", MomentumOta.badBuilds(context).contains("20990201-000000Z-broken"));
        assertFalse("not on trial any more", MomentumOta.onTrial(context));
        assertFalse("its files are cleared away", MomentumOta.dirOf(context, "20990201-000000Z-broken").exists());
        Build again = new Build("20990201-000000Z-broken", "2099-02-01T00:00:00.000Z");
        expect("bad-build", again.downloader(), again, null, OLD_APK);
    }

    @Test
    public void aFirstBuildThatNeverComesUpFallsBackToTheApk() throws Exception {
        install(new Build("20990101-000000Z-dead", "2099-01-01T00:00:00.000Z"), null, OLD_APK);
        MomentumOta.resolveAtStartup(context, OLD_APK);
        MomentumOta.resolveAtStartup(context, OLD_APK);
        assertNull("the third start serves the copy in the APK", MomentumOta.resolveAtStartup(context, OLD_APK));
        assertEquals("", capPath());
        assertNull(MomentumOta.current(context));
    }

    @Test
    public void confirmingResetsTheCountSoOrdinaryRestartsAreNeverMistakenForFailures() throws Exception {
        install(new Build("20990101-000000Z-fine", "2099-01-01T00:00:00.000Z"), null, OLD_APK);
        for (int i = 0; i < 10; i++) {
            assertNotNull("start " + i, MomentumOta.resolveAtStartup(context, OLD_APK));
            MomentumOta.confirm(context);
        }
        assertEquals("20990101-000000Z-fine", MomentumOta.current(context));
        assertTrue(MomentumOta.badBuilds(context).isEmpty());
    }

    @Test
    public void aNewerApkAlwaysBeatsAnOldDownload() throws Exception {
        install(new Build("20990101-000000Z-old", "2099-01-01T00:00:00.000Z"), null, OLD_APK);
        assertNotNull(MomentumOta.resolveAtStartup(context, OLD_APK));
        MomentumOta.confirm(context);
        assertNull("the APK was rebuilt after that download", MomentumOta.resolveAtStartup(context, "2100-01-01T00:00:00.000Z"));
        assertEquals("", capPath());
        assertNull(MomentumOta.current(context));
        assertFalse("and the old files are cleared", MomentumOta.dirOf(context, "20990101-000000Z-old").exists());
    }

    @Test
    public void aBuildWhoseFilesHaveGoneMissingIsNotServed() throws Exception {
        install(new Build("20990101-000000Z-gone", "2099-01-01T00:00:00.000Z"), null, OLD_APK);
        MomentumOta.resolveAtStartup(context, OLD_APK);
        MomentumOta.confirm(context);
        assertTrue(new File(MomentumOta.dirOf(context, "20990101-000000Z-gone"), "index.html").delete());
        assertNull(MomentumOta.resolveAtStartup(context, OLD_APK));
        assertEquals("", capPath());
    }

    @Test
    public void aPendingBuildWhoseFilesAreMissingIsIgnored() throws Exception {
        install(new Build("20990101-000000Z-half", "2099-01-01T00:00:00.000Z"), null, OLD_APK);
        deleteTree(MomentumOta.dirOf(context, "20990101-000000Z-half"));
        assertNull(MomentumOta.resolveAtStartup(context, OLD_APK));
        assertNull(MomentumOta.pending(context));
    }

    @Test
    public void onlyTheBuildsInUseAreKept() throws Exception {
        for (String id : new String[] { "20990101-000000Z-a", "20990201-000000Z-b", "20990301-000000Z-c" }) {
            install(new Build(id, id.substring(0, 4) + "-" + id.substring(4, 6) + "-" + id.substring(6, 8) + "T00:00:00.000Z"), null, OLD_APK);
            MomentumOta.resolveAtStartup(context, OLD_APK);
            MomentumOta.confirm(context);
        }
        String[] names = MomentumOta.root(context).list();
        java.util.Arrays.sort(names);
        assertEquals("the one running and the one before it", "[20990201-000000Z-b, 20990301-000000Z-c]", java.util.Arrays.toString(names));
    }

    // ---- what the app can ask ----------------------------------------------------------------

    @Test
    public void infoSaysWhatIsRunningAndWhatIsWaiting() throws Exception {
        JSONObject empty = MomentumOta.info(context, OLD_APK);
        assertEquals(MomentumOta.NATIVE_API, empty.getInt("nativeApi"));
        assertTrue(empty.isNull("current"));
        assertEquals(OLD_APK, empty.getString("bundledBuild"));
        install(new Build("20990101-000000Z-info", "2099-01-01T00:00:00.000Z"), null, OLD_APK);
        assertEquals("20990101-000000Z-info", MomentumOta.info(context, OLD_APK).getString("pending"));
        MomentumOta.resolveAtStartup(context, OLD_APK);
        JSONObject running = MomentumOta.info(context, OLD_APK);
        assertEquals("20990101-000000Z-info", running.getString("current"));
        assertEquals("2099-01-01T00:00:00.000Z", running.getString("currentBuild"));
        assertTrue(running.getBoolean("onTrial"));
    }

    @Test
    public void theBuildInsideThisApkSaysWhenItWasMade() {
        String built = MomentumOta.bundledBuild(context);
        // Present once the web app has been copied into the project, which CI always does before building.
        if (built != null) assertTrue(built, MomentumOta.isIso(built));
    }

    @Test
    public void aMissingPublicKeyIsNotACrash() {
        String key = MomentumOta.publicKey(context);
        assertTrue(key == null || key.length() > 40);
    }
}
