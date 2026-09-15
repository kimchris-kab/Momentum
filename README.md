# Momentum

A daily habit / identity tracker built with React (see `src/Momentum.jsx`). This
repo is set up two ways to run:

- **As a web app / installable PWA** — works right now, no extra tooling.
- **As a native Android app (.apk)** — fully scaffolded with Capacitor; needs one
  local build step (see below) because this dev sandbox's network policy blocks
  `dl.google.com`, where the Android SDK / Android Gradle Plugin are hosted. That
  block doesn't apply on your own machine.

## Run it as a web app

```
npm install
npm run dev       # http://localhost:5173
```

## Build the installable PWA

```
npm run build      # outputs dist/ — a static site with manifest + service worker
npm run preview     # serve dist/ locally to sanity-check it
```

Host `dist/` anywhere with HTTPS (GitHub Pages, Netlify, Vercel, Netlify Drop,
etc.) and open it in Chrome on Android — the browser will offer **"Add to Home
Screen" / "Install app"**, which gives you a real home-screen icon and a
full-screen standalone window. No Android Studio, no APK, works today.

## Build the actual .apk (native Android)

The native Android project already exists at `android/` (generated via
Capacitor). To turn it into an installable `.apk`:

1. Install **Android Studio** (it bundles the JDK and Android SDK, and is by
   far the easiest route) — https://developer.android.com/studio
2. From the project root:
   ```
   npm install
   npm run build
   npx cap sync android
   ```
3. Open the `android/` folder in Android Studio, let it sync (first sync
   downloads the SDK — takes a few minutes), then **Build → Build Bundle(s) /
   APK(s) → Build APK(s)**.
4. The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it
   to your phone (email, Drive, USB, adb install) and tap to install — you may
   need to enable "Install unknown apps" for whichever app you use to open it.

Command-line alternative (no Android Studio UI), once you have the Android SDK
installed and `ANDROID_HOME` set:
```
cd android
./gradlew assembleDebug
```

This is a **debug** build, which is enough to install and run on your own
device. For a Play Store release build you'd additionally generate a signing
key and run `./gradlew bundleRelease`.

## Project layout

- `src/Momentum.jsx` — app shell: state, storage, routing, nav, FAB, undo toast
- `src/theme.js` — design tokens (palette, type, radii), shared style objects,
  and the CSS keyframes for the 3D motion/sparkle layer
- `src/data/constants.js` — domain data: pillars, mantras, money playbook, moods
- `src/lib/date.js` — date helpers and relative-date labels
- `src/lib/tasks.js` — the task engine: one model for todos, habits-to-build and
  habits-to-avoid, with recurrence rules, per-day completion, streaks, heatmap,
  identity votes, grouping, sorting, search and manual reordering
- `src/lib/migrate.js` — schema v1 → v2 migration (old weekday routine templates
  collapse into recurring tasks; completions replay into the day log)
- `src/components/` — UI primitives (Card, Sheet, SegmentedControl, ProgressRing,
  Toast…), the task row, and the full task editor sheet
- `src/lib/habits.js` — habit formation: freeze-protected streaks, milestones, rewards,
  never-miss-twice detection and the weekly-review scoring
- `src/lib/notify.js` — habit reminders, via Capacitor local notifications on the installed
  Android app, Notification Triggers in a supporting installed PWA, or in-page timers as a
  last resort (which only fire while the app is open — the UI says so rather than pretending)
- `src/lib/money.js` — ledger maths: month totals, category breakdown, recurring posting, CSV
- `src/views/` — Today, Tasks, Habits, Identity, Check-in, Journal, Money, Insights, Review

### Reminders

Reminders need the app **installed** — home-screen PWA or the APK — and one permission
grant (Habits → "Turn on reminders"). In a plain browser tab they only fire while the tab is
open. On Android the `@capacitor/local-notifications` plugin schedules real OS alarms; run
`npx cap sync android` after installing dependencies so the plugin is wired in.
- `src/storageShim.js` — polyfills the `window.storage.get/set` API the app
  uses for persistence, backed by `localStorage`, so it works outside its
  original host environment
- `scripts/gen_icons.py` — regenerates `public/icons/*` (pure Python, no deps)
- `android/` — native Android project (Capacitor)
- `capacitor.config.json` — native app id / name / web dir config
