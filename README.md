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

- `src/Momentum.jsx` — the app itself: the original habit/identity tracker, a
  decorative absolutely-positioned 3D motion/sparkle layer, and a Google
  Tasks-style ad-hoc task list (due dates, subtasks, notes, starring,
  overdue/completed grouping) reachable from the list icon on "Today's plan"
- `src/storageShim.js` — polyfills the `window.storage.get/set` API the app
  uses for persistence, backed by `localStorage`, so it works outside its
  original host environment
- `scripts/gen_icons.py` — regenerates `public/icons/*` (pure Python, no deps)
- `android/` — native Android project (Capacitor)
- `capacitor.config.json` — native app id / name / web dir config
