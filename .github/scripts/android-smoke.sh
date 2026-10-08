#!/usr/bin/env bash
# Installs the APK on an emulator, opens it, and checks it actually starts.
#
# Compiling proves the code is valid; this proves the app gets past its own startup screen on
# a real Android WebView — which the first build did not, on the first phone it met. The app
# marks each startup step in the console as "[momentum] boot: …"; Capacitor forwards the
# console to the system log, so the log says exactly how far it got.
set -u

APK=$(ls momentum-*-debug.apk | head -1)
echo "Installing $APK"
adb install -r "$APK"

adb logcat -c
adb shell am start -W -n com.momentum.app/.MainActivity

# Generous: a cold WebView on an emulator is slow, and the point is to tell "slow" from "stuck".
for i in $(seq 1 45); do
  sleep 2
  if adb logcat -d | grep -q "\[momentum\] boot: ready"; then
    echo "Reached 'ready' after about $((i * 2))s"
    break
  fi
done

# Reaching "ready" isn't the finish line. The first real-phone crash came a moment *after*
# it — a notification listener that threw once the app had drawn — and this check waved it
# through because it stopped looking at "ready". So it keeps watching for a few more seconds.
sleep 8

adb exec-out screencap -p > smoke-start.png || true
adb logcat -d > logcat.txt || true
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1 || true

echo
echo "===== The app's own startup marks and errors ====="
grep -F "[momentum]" logcat.txt || echo "(none — the app never logged a single startup step)"
echo
echo "===== WebView console and crashes ====="
grep -E "Capacitor/Console|Capacitor:|chromium|AndroidRuntime|FATAL EXCEPTION|E Capacitor" logcat.txt | tail -120 || true

echo
echo "===== What's on the screen (accessibility text) ====="
if [ -f ui.xml ]; then
  grep -o 'text="[^"]\{2,\}"' ui.xml | head -25 || true
fi

if ! grep -qF "[momentum] boot: ready" logcat.txt; then
  echo
  echo "SMOKE FAILED: the app never reached 'ready'."
  exit 1
fi
# Capacitor reports every uncaught error in the page as "JavaScript Error"; the app's own
# boundary logs "[momentum] crashed". Either one after starting is a failure, whatever
# "ready" said.
if grep -qE "E Capacitor: JavaScript Error|\[momentum\] crashed" logcat.txt; then
  echo
  echo "SMOKE FAILED: the app started, then threw:"
  grep -E "E Capacitor: JavaScript Error|\[momentum\] crashed" logcat.txt | head -5
  exit 1
fi

# ---------------------------------------------------------------------------------------------
# Over-the-air updates, end to end on the real app: does Capacitor actually serve a build that was
# downloaded into the app's own folder, and does a build that never comes up get dropped?
#
# No network is involved. The web app inside this APK is unpacked, given a newer build stamp and a
# marker line, and put where a finished download would be, with the same bookkeeping the installer
# writes. Then the app is started the way a user would start it.
# ---------------------------------------------------------------------------------------------
PKG=com.momentum.app
wait_ready() {
  for i in $(seq 1 45); do
    sleep 2
    if adb logcat -d | grep -q "\[momentum\] boot: ready"; then return 0; fi
  done
  return 1
}
start_fresh() {
  adb shell am force-stop "$PKG"
  adb logcat -c
  adb shell am start -W -n "$PKG/.MainActivity" >/dev/null
  wait_ready
}
stage() {  # stage <id> <marker or empty> <broken: yes|no>
  rm -rf ota-stage && mkdir -p ota-stage
  unzip -q "$APK" 'assets/public/*' -d apkx
  cp -r apkx/assets/public/. ota-stage/
  rm -rf apkx
  printf '{"app":"momentum","version":"1.0.0","build":"%s","commit":"smoke","requiresNativeApi":1}' "$4" > ota-stage/build.json
  if [ "$3" = "yes" ]; then
    # A build that loads but never starts the app: the page is there, the app is not.
    printf '<!doctype html><html><body>this build is broken</body></html>' > ota-stage/index.html
  elif [ -n "$2" ]; then
    sed -i "s#<head>#<head><script>console.log('$2')</script>#" ota-stage/index.html
  fi
  adb shell rm -rf /data/local/tmp/ota-stage
  adb push ota-stage /data/local/tmp/ota-stage >/dev/null
  # One string for the phone's shell: adb joins its arguments with spaces and the phone re-splits them,
  # so an unquoted "&&" would end the sh -c early.
  adb shell "run-as $PKG sh -c 'mkdir -p files/ota && rm -rf files/ota/$1 && cp -r /data/local/tmp/ota-stage files/ota/$1'"
}
prefs() {  # prefs <current> <previous> <pending> <trial> <starts> <bad...>
  adb shell am force-stop "$PKG"
  adb shell "run-as $PKG sh -c 'mkdir -p shared_prefs && cat > shared_prefs/momentum_ota.xml'" <<XML
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
$( [ -n "$1" ] && echo "    <string name=\"current\">$1</string>" )
$( [ -n "$2" ] && echo "    <string name=\"previous\">$2</string>" )
$( [ -n "$3" ] && echo "    <string name=\"pending\">$3</string>" )
$( [ -n "$4" ] && echo "    <string name=\"trial\">$4</string>" )
    <int name="trialStarts" value="$5" />
</map>
XML
}

# What to show when an over-the-air step fails: enough to see which link in the chain broke, without a second run.
diag() {
  echo "----- diagnostics -----"
  echo "-- the installer's bookkeeping:"; adb shell "run-as $PKG cat shared_prefs/momentum_ota.xml" 2>&1 | head -20
  echo "-- what Capacitor was told to serve:"; adb shell "run-as $PKG cat shared_prefs/CapWebViewSettings.xml" 2>&1 | head -20
  echo "-- the downloaded folders:"; adb shell "run-as $PKG ls -la files/ota files/ota/smoke-ota-1" 2>&1 | head -30
  echo "-- the service worker folder:"; adb shell "run-as $PKG ls app_webview/Default" 2>&1 | head -20
  echo "-- the marker in the staged page:"; adb shell "run-as $PKG grep -c smoke files/ota/smoke-ota-1/index.html" 2>&1 | head -3
  echo "-- what the web view was asked for first:"; adb logcat -d | grep -E "Loading app|Handling local request: https://localhost/(index|$)|MomentumOta|serverBasePath" | head -15
}

echo
echo "===== Over the air: a downloaded build is the one that runs ====="
stage smoke-ota-1 "[smoke] served-from-ota" no "2099-01-01T00:00:00.000Z"
prefs "" "" smoke-ota-1 "" 0
if ! start_fresh; then echo "OTA SMOKE FAILED: the app never started from the downloaded build."; adb logcat -d | tail -40; exit 1; fi
if ! adb logcat -d | grep -qF "[smoke] served-from-ota"; then
  echo "OTA SMOKE FAILED: the app started, but not from the downloaded build."
  diag
  exit 1
fi
echo "OK: it started from the downloaded build, and the web app confirmed it."
# The web app confirms a moment after it has drawn, and a slow emulator can make that moment several seconds, so look for
# a while rather than once.
for i in $(seq 1 15); do
  sleep 2
  if ! adb shell "run-as $PKG cat shared_prefs/momentum_ota.xml" | grep -q 'name="trial"'; then break; fi
done
if adb shell "run-as $PKG cat shared_prefs/momentum_ota.xml" | grep -q 'name="trial"'; then
  echo "OTA SMOKE FAILED: the build was still on trial after the app came up."
  adb shell "run-as $PKG cat shared_prefs/momentum_ota.xml"
  adb logcat -d | grep -E "MomentumOta|boot: ready" | tail -10
  exit 1
fi
echo "OK: the trial ended once the app was up."

echo
echo "===== Over the air: a build that never starts is dropped ====="
stage smoke-broken "" yes "2099-02-01T00:00:00.000Z"
adb shell am force-stop "$PKG"
# Make the broken build the one waiting, on top of the good one that is running.
prefs smoke-ota-1 "" smoke-broken "" 0
for n in 1 2; do
  adb shell am force-stop "$PKG"; adb logcat -c
  adb shell am start -W -n "$PKG/.MainActivity" >/dev/null
  sleep 12
  if adb logcat -d | grep -q "\[momentum\] boot: ready"; then
    echo "OTA SMOKE FAILED: the broken build reported ready on start $n."
    exit 1
  fi
done
echo "OK: it did not start, twice, as expected."
if ! start_fresh; then
  echo "OTA SMOKE FAILED: after three failed starts the app did not fall back to the build before it."
  adb logcat -d | tail -40
  exit 1
fi
if ! adb logcat -d | grep -qF "[smoke] served-from-ota"; then
  echo "OTA SMOKE FAILED: it came back up, but not on the build that worked before."
  exit 1
fi
if ! adb shell "run-as $PKG cat shared_prefs/momentum_ota.xml" | grep -q "smoke-broken"; then
  echo "OTA SMOKE FAILED: the broken build was not remembered as bad."
  adb shell "run-as $PKG cat shared_prefs/momentum_ota.xml"
  exit 1
fi
echo "OK: back on the build that worked, and the broken one will not be tried again."

echo
echo "===== Over the air: a newer APK beats an old download ====="
prefs smoke-ota-1 "" "" "" 0
# The download claims to be older than the APK that is installed.
stage smoke-old "[smoke] served-from-old-download" no "2001-01-01T00:00:00.000Z"
prefs smoke-old "" "" "" 0
if ! start_fresh; then echo "OTA SMOKE FAILED: the app did not start."; exit 1; fi
if adb logcat -d | grep -qF "[smoke] served-from-old-download"; then
  echo "OTA SMOKE FAILED: an old download was served instead of the newer web app inside the APK."
  exit 1
fi
echo "OK: the web app inside the APK won over an older download."

echo
echo "SMOKE PASSED: the app started and stayed up with no uncaught errors, and over-the-air updates work."
exit 0
