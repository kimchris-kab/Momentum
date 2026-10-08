# Cloud backup with Supabase

Momentum keeps everything on the device. This adds one more copy, in a Supabase project you
own, so losing the phone doesn't lose the data.

It is a **backup, not sync**: one row per account, replaced wholesale, and the newest device
to back up wins. Restoring replaces what is on the device — that is the simple, explicable
behaviour and it stays the default.

Where two devices have diverged, restoring offers to **merge** instead of replacing, and says
how much it would bring back before you choose. Backing up does it without being asked: if the
row has been written since this device last saw it, the other copy is pulled and folded in
before anything is sent, so the second device to back up on a given day no longer lands on top
of the first. Merging cannot lose a record, so there is nothing there worth stopping to ask
about. A merge never loses a record: everything either
side knows about survives. What it cannot do is reconcile the *same* record edited in both
places — one of those edits wins, by the later clock — and the app says so on the button
rather than leaving you to find out. Deleting is remembered for 90 days so a merge doesn't
hand back what you removed; undoing a delete forgets it again.

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
  would replace — with the option to merge rather than replace when the two have diverged.

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
| The Android APK | New web builds are downloaded and swapped in by the app itself (next section). Anything that needs new *native* code still needs a new APK, and the app says so. |

The installed Android app *can* update itself now: see the next section.

> As with the backup, none of this has run against a real Supabase project. The deploy
> script's request shapes follow the published Storage API; the app's half was driven
> end-to-end in a browser against a stand-in server. One thing that stand-in got wrong the
> first time is instructive: it demanded an API key for a *public* object, which real
> Supabase does not.


---

# Updating the installed Android app by itself

The Android app is a web app inside a native shell. The web half is what changes most, so it can be
replaced over the air from this same Supabase project, without reinstalling and without touching your data.

## What it does

1. Every push to your release branch is built, tested, started on an emulator, and only then published to
   `ota/<build id>/` in the `app` bucket, with `ota/latest.json` written last.
2. The installed app looks at `latest.json` shortly after it starts and whenever it comes back to the front,
   at most every six hours.
3. If the build is newer than what it has, it downloads exactly the files listed, checks every one against the
   SHA-256 in the manifest, and stages them in a folder of their own. A file that doesn't match stops everything
   and leaves nothing behind.
4. The next time you open the app it starts from the new build, and a toast offers **Restart now** if you'd
   rather not wait. The new build is served from the same place as the old one, so everything saved on the
   phone is where it was.

It does **not** load the app from a web address. That would change the app's origin and the phone would stop
finding what you saved.

## Safety nets

- **A build that doesn't start is dropped.** A new build is on trial until the web app says it came up. If it
  fails to come up on three starts in a row, the app goes back to the build before it (or the copy inside the
  APK) and never tries that one again.
- **A newer APK always wins.** Reinstalling the app brings its own web build; an older download is ignored.
- **Native changes need a new APK.** Each build says which version of the native shell it needs
  (`src/lib/nativeApi.js`). An installed app that is older than that doesn't take the build and says it needs
  the latest APK.
- **Limits.** At most 400 files and 30 MB; only plain file names, never a path that climbs out of its folder;
  only HTTPS, no redirects.

## Setting it up

You need the Supabase project from the first part of this guide, and its `app` bucket (public).

1. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Add
   `SUPABASE_URL` (the project URL) and `SUPABASE_SERVICE_KEY` (the **service role** key from Supabase →
   Project Settings → API). These are the only places that key should ever be.
2. Under **Variables**, add `OTA_BRANCH` with the name of the branch you ship from if it isn't `main`.
3. Install the newest APK once. From then on, builds published from that branch reach the phone by themselves.

Until the two secrets exist the publish job runs, says so, and does nothing.

In the app, **Settings → This build** shows what is running, has a **Check** button, and a switch,
**Update the app by itself**. The app uses the Supabase address you already entered for the backup.

## Optional: only accept updates you signed

Without this, anyone who can write to your `app` bucket can change what your app does, and the service key is
the only thing standing in the way. Signing removes that: the app is built with a public key and refuses any
build whose signature it can't check.

```
node scripts/ota-keygen.mjs
```

It prints a private key and a public key and writes nothing.

- Put the **private** key in a repository secret called `OTA_SIGNING_KEY`. Nowhere else.
- Commit the **public** key as `android/app/src/main/assets/ota-public-key.txt`, then install a new APK once.

From then on the app only takes signed builds, and the publish job signs each one.

## Trust, plainly

An over-the-air update is code that runs inside your app with access to your data. The hashes protect against
a damaged or half-finished download. They do **not** protect against someone who can write to your bucket:
for that you need the signature above. Keep the service key in the one GitHub secret, and turn on signing.

> None of this has run against a real Supabase project; the publisher's requests follow the published Storage
> API and are checked against a stand-in, and the installer is exercised on an emulator with the downloads
> replaced by local files.
