# Cloud backup with Supabase

Momentum keeps everything on the device. This adds one more copy, in a Supabase project you
own, so losing the phone doesn't lose the data.

It is a **backup, not sync**: one row per account, replaced wholesale, and the newest device
to back up wins. If you edit on two devices between backups, one of those edits goes. The app
says so where you turn it on.

> None of this has been run against a live Supabase project. It was written without one —
> there was no project or key in the environment — so every call was tested against a stub of
> `fetch` rather than a real server. The request shapes follow the published REST API, but
> expect to meet a surprise or two the first time you point it at a real project.

## 1. Make a project

1. Create a project at supabase.com. Any region; the free tier is far more than this needs.
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](../supabase/schema.sql),
   and run it. That creates one table and the row-level security policies that keep accounts
   apart.
3. Open **Project Settings → API** and copy two things:
   - the **Project URL** (`https://<something>.supabase.co`)
   - the **anon / public key**

The anon key is meant to be public — it identifies the project, it doesn't grant access.
Access comes from being signed in, and the policies in the SQL are what enforce it. Never put
the **service role** key in the app: that one bypasses row-level security entirely.

## 2. Decide how accounts are confirmed

By default Supabase emails a confirmation link before a new account can sign in. That is the
safe default and worth keeping. If you're the only user and want to skip it, turn off
**Authentication → Sign In / Providers → Confirm email**. The app handles both: an unconfirmed
signup is reported as "check your email", not as a failure.

## 3. Point the app at it

Either at build time, in `.env`:

```
VITE_SUPABASE_URL=https://<something>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

…or on the device, under **Settings → Cloud backup**, which is the option that works for a
build you can't rebuild — the published preview, for instance. Keys entered on the device
stay on that device.

## 4. What it does once it's on

- Backs up automatically after changes settle, at most once every 45 seconds.
- Shows when the last backup happened and from which device.
- Restores on demand, always behind a preview of what the backup holds and what restoring
  would replace.

Two guards exist because an automatic backup can destroy data as easily as save it:

- **An empty device never overwrites a full backup.** Signing in on a new phone pulls; it
  does not push its emptiness over months of history.
- **A backup that would shrink by more than a quarter is asked about, not assumed.** That is
  either a deliberate clear-out or a mistake, and the app cannot tell which.

## Cost

Comfortably inside the free tier for one person: one row of a few hundred kilobytes, written
a few times a day. The row has a 2 MB ceiling in the schema so a bug can't fill the disk.

## Turning it off

Sign out in Settings. That clears the session on the device and leaves the backup in place.
To remove the data as well, delete the row in the Supabase table editor, or delete the
project — the `on delete cascade` on the account takes the backup with it.

---

# Shipping updates from Supabase Storage

The same project can host the built app, so a new version reaches an installed copy without
you emailing anyone a file.

## 1. Make a public bucket

**Storage → New bucket**, name it `app`, and mark it **public**. Public means anyone with the
URL can read the files in it — which is what hosting an app means. Nothing private goes in
this bucket; the data lives in the table behind row-level security, not here.

## 2. Deploy

```
npm run build
SUPABASE_URL=https://<something>.supabase.co \
SUPABASE_SERVICE_KEY=<service role key> \
node scripts/deploy-supabase.mjs --notes "What changed"
```

`--dry-run` prints what it would upload, with the content type and cache header for each
file, and uploads nothing.

The **service role key** bypasses row-level security entirely. It belongs in your terminal
and nowhere else — never in the app, never in the repo, never in a build. The script reads it
from the environment and never writes it anywhere.

Two details in the script matter more than they look:

- Hashed asset filenames (`index-DU_mhLXy.js`) are cached for a year; `index.html`, `sw.js`
  and `version.json` are marked `no-cache`. Get that backwards and a browser serves last
  week's app forever, however often it checks for updates.
- `version.json` is uploaded **last**, so it never announces a build whose files haven't all
  arrived yet.

## 3. What the app does with it

Settings shows the running build. It checks the manifest at most every six hours, and on
demand. It is deliberately unwilling to claim an update: a manifest that's missing,
malformed, for another app, or not actually newer all mean "nothing to do", and an automatic
check that finds nothing says nothing at all.

What "apply it" means depends on where it's running, and the app says which:

| Where | What happens |
| --- | --- |
| Browser or installed PWA | Reload. The service worker has already fetched the new files. |
| Preview link | Reload. |
| The Android APK | **Nothing.** The code ships inside the APK, so a new version has to be installed the way the old one was. The app says so rather than offering a button that can't work. |

Making the Android app update itself needs a native live-update mechanism (Capacitor's, or
your own unzip-and-swap). That isn't implemented here, and pretending otherwise would be
worse than not offering it.

> As with the backup, none of this has run against a real Supabase project. The deploy
> script's request shapes follow the published Storage API; the app's half was driven
> end-to-end in a browser against a stand-in server. One thing that stand-in got wrong the
> first time is instructive: it demanded an API key for a *public* object, which real
> Supabase does not.
