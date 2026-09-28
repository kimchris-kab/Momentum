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
echo
echo "SMOKE PASSED: the app started and stayed up with no uncaught errors."
exit 0
