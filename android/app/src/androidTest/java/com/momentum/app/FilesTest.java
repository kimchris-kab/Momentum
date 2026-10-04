package com.momentum.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Writes a backup the way the app does, then goes and finds it in Downloads and reads it back.
 *
 * The first backup button said "Saved to your downloads" and wrote nothing — nothing ever looked
 * for the file, so nothing noticed. This looks: it asks Android itself what's in Downloads.
 */
@RunWith(AndroidJUnit4.class)
public class FilesTest {

    private Context context;
    private ContentResolver resolver;
    private final List<Uri> made = new ArrayList<>();

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        resolver = context.getContentResolver();
    }

    @After
    public void tearDown() {
        for (Uri uri : made) {
            try { resolver.delete(uri, null, null); } catch (Exception ignored) { }
        }
    }

    private MomentumFilesPlugin.Saved save(String name, String text) throws IOException {
        MomentumFilesPlugin.Saved saved = MomentumFilesPlugin.saveToDownloads(context, name, "application/json", text);
        made.add(saved.uri);
        return saved;
    }

    private static String read(ContentResolver resolver, Uri uri) throws IOException {
        try (InputStream in = resolver.openInputStream(uri)) {
            assertNotNull("the file can be opened", in);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    /** Asks Android which files in Downloads have this name — independent of the Uri we were given. */
    private int inDownloads(String displayName) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return -1;
        try (Cursor c = resolver.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                new String[] { MediaStore.MediaColumns.DISPLAY_NAME },
                MediaStore.MediaColumns.DISPLAY_NAME + " = ?", new String[] { displayName }, null)) {
            return c == null ? 0 : c.getCount();
        }
    }

    @Test
    public void aBackupLandsInDownloadsAndReadsBackIntact() throws Exception {
        String json = "{\"format\":\"momentum-backup\",\"version\":3,\"tasks\":[{\"id\":\"t1\",\"text\":\"Walk\"}]}";
        MomentumFilesPlugin.Saved saved = save("momentum-backup-test.json", json);
        assertEquals("it says it went to Downloads", "Downloads", saved.location);
        assertTrue("it says what the file was called", saved.name.startsWith("momentum-backup-test"));
        assertEquals("what was written is what comes back", json, read(resolver, saved.uri));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            assertEquals("and Android's own Downloads listing has it", 1, inDownloads(saved.name));
        }
    }

    @Test
    public void aSecondBackupOnTheSameDayIsKeptNotOverwritten() throws Exception {
        MomentumFilesPlugin.Saved first = save("momentum-backup-twice.json", "{\"n\":1}");
        MomentumFilesPlugin.Saved second = save("momentum-backup-twice.json", "{\"n\":2}");
        assertNotEquals("the second has its own name", first.name, second.name);
        assertEquals("the first is untouched", "{\"n\":1}", read(resolver, first.uri));
        assertEquals("the second is what was just saved", "{\"n\":2}", read(resolver, second.uri));
    }

    @Test
    public void accentsDashesAndEmojiSurvive() throws Exception {
        String text = "{\"note\":\"caf\u00E9 \u2014 \u201Cquoted\u201D \u2713 \uD83D\uDE0A\"}";
        MomentumFilesPlugin.Saved saved = save("momentum-backup-unicode.json", text);
        assertEquals(text, read(resolver, saved.uri));
    }

    @Test
    public void aBigBackupIsWrittenWhole() throws Exception {
        StringBuilder sb = new StringBuilder("{\"log\":[");
        for (int i = 0; i < 60_000; i++) sb.append(i == 0 ? "" : ",").append("{\"i\":").append(i).append(",\"t\":\"entry ").append(i).append("\"}");
        sb.append("]}");
        String big = sb.toString();
        assertTrue("it's a meaningful size (" + big.length() + ")", big.length() > 1_500_000);
        MomentumFilesPlugin.Saved saved = save("momentum-backup-big.json", big);
        assertEquals("every byte came back", big.length(), read(resolver, saved.uri).length());
    }

    @Test
    public void anEmptyBackupIsStillAFile() throws Exception {
        MomentumFilesPlugin.Saved saved = save("momentum-backup-empty.json", "");
        assertEquals("", read(resolver, saved.uri));
    }

    @Test
    public void namesCannotEscapeTheirFolder() {
        assertEquals("slashes are gone", "_.._etc_passwd", MomentumFilesPlugin.safeName("/../etc/passwd"));
        assertFalse(MomentumFilesPlugin.safeName("../../secret").contains("/"));
        assertFalse(MomentumFilesPlugin.safeName("a\\b:c*d?e").matches(".*[\\\\:*?].*"));
        assertEquals("a hidden-file name is made visible", "env", MomentumFilesPlugin.safeName("...env"));
        assertEquals("nothing at all gets a name", "momentum-export.json", MomentumFilesPlugin.safeName(""));
        assertEquals("...so does nothing but dots", "momentum-export.json", MomentumFilesPlugin.safeName("..."));
        assertEquals("null too", "momentum-export.json", MomentumFilesPlugin.safeName(null));
        assertTrue("an absurdly long name is cut", MomentumFilesPlugin.safeName(new String(new char[400]).replace('\0', 'x')).length() <= 120);
        assertEquals("an ordinary name is left alone", "momentum-backup-2026-10-04.json",
                MomentumFilesPlugin.safeName("momentum-backup-2026-10-04.json"));
    }

    @Test
    public void theShareSheetCanBeHandedTheFile() throws Exception {
        // Sharing goes through the FileProvider declared in the manifest. A wrong path in its
        // config doesn't fail at build time — it throws the moment someone taps Share.
        String json = "{\"shared\":true}";
        Uri uri = MomentumFilesPlugin.stageForShare(context, "momentum-backup-share.json", json);
        assertEquals("content", uri.getScheme());
        assertEquals(context.getPackageName() + ".fileprovider", uri.getAuthority());
        assertEquals("the link opens to the file's contents", json, read(resolver, uri));
    }
}
