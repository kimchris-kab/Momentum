package com.momentum.app;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Gets a file out of the app. A web view has no download handler, so the usual "make a link and
 * click it" does nothing here at all — which is how the first backup button came to say "Saved to
 * your downloads" while writing nothing anywhere.
 *
 * save  writes into the phone's real Downloads folder (through MediaStore, which needs no
 *       permission for a file the app creates itself) and says where it went.
 * share opens the share sheet with the file attached, to send it to Drive, email or a chat.
 *
 * NOT YET RUN ON A REAL PHONE: written to the same contract as the widget — compiled on every
 * push and exercised on an emulator by FilesTest, which writes a file and reads it back from
 * Downloads — but nobody has yet watched it on a real handset.
 */
@CapacitorPlugin(name = "MomentumFiles")
public class MomentumFilesPlugin extends Plugin {

    /** Where a file actually ended up. The name can differ from the one asked for. */
    static final class Saved {
        final String name;
        final String location;
        final Uri uri;

        Saved(String name, String location, Uri uri) {
            this.name = name;
            this.location = location;
            this.uri = uri;
        }
    }

    private static final String DEFAULT_NAME = "momentum-export.json";

    /** A name that can't climb out of its folder or trip the file system. */
    static String safeName(String raw) {
        String name = raw == null ? "" : raw.trim();
        name = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        // Leading dots hide a file; ".." is a path. Neither is wanted.
        while (name.startsWith(".")) name = name.substring(1);
        if (name.length() > 120) name = name.substring(name.length() - 120);
        return name.isEmpty() ? DEFAULT_NAME : name;
    }

    /**
     * Writes into Downloads. From Android 10 that's MediaStore.Downloads, where the file shows up
     * in the Files app straight away and a second file with the same name is renamed "(1)" rather
     * than overwritten. Before that there's no permission-free way to reach Downloads, so it goes
     * to the app's own Documents folder — and says so, instead of claiming Downloads.
     */
    static Saved saveToDownloads(Context context, String filename, String mime, String text) throws IOException {
        String name = safeName(filename);
        byte[] bytes = (text == null ? "" : text).getBytes(StandardCharsets.UTF_8);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = context.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime == null || mime.isEmpty() ? "application/json" : mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            // Hidden from other apps until it's complete, so nothing sees half a backup.
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException("Android wouldn't create a file in Downloads");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IOException("Android wouldn't open the new file for writing");
                out.write(bytes);
            } catch (IOException e) {
                resolver.delete(uri, null, null);
                throw e;
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, done, null, null);
            return new Saved(displayName(resolver, uri, name), "Downloads", uri);
        }

        File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        if (dir == null) throw new IOException("There's no storage available to save to");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Couldn't create " + dir.getPath());
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return new Saved(name, "the app's Documents folder (Android/data/" + context.getPackageName() + "/files/Documents)", Uri.fromFile(file));
    }

    /** The name Android settled on, which differs from the one asked for if that was taken. */
    private static String displayName(ContentResolver resolver, Uri uri, String fallback) {
        try (Cursor c = resolver.query(uri, new String[] { MediaStore.MediaColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String shown = c.getString(0);
                if (shown != null && !shown.isEmpty()) return shown;
            }
        } catch (Exception ignored) {
            // Fall through: the file is saved, only its final name couldn't be read back.
        }
        return fallback;
    }

    /** Writes the file where the share sheet can hand it to another app, and returns a link to it. */
    static Uri stageForShare(Context context, String filename, String text) throws IOException {
        File dir = new File(context.getCacheDir(), "shared");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Couldn't create " + dir.getPath());
        File file = new File(dir, safeName(filename));
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write((text == null ? "" : text).getBytes(StandardCharsets.UTF_8));
        }
        return FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
    }

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename");
        String text = call.getString("text");
        if (text == null) {
            call.reject("There was nothing to save");
            return;
        }
        try {
            Saved saved = saveToDownloads(getContext(), filename, call.getString("mime", "application/json"), text);
            JSObject result = new JSObject();
            result.put("name", saved.name);
            result.put("location", saved.location);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        }
    }

    @PluginMethod
    public void share(PluginCall call) {
        String text = call.getString("text");
        if (text == null) {
            call.reject("There was nothing to share");
            return;
        }
        try {
            Uri uri = stageForShare(getContext(), call.getString("filename"), text);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(call.getString("mime", "application/json"));
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newRawUri("", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Send your backup");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        }
    }
}
