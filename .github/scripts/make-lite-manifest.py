#!/usr/bin/env python3
"""Strip what Google Play Protect blocks a sideloaded app for: permission to receive texts, and the notification listener.

Usage: make-lite-manifest.py <AndroidManifest.xml>   (edits it in place; the workflow restores it with git afterwards)
"""
import re
import sys

path = sys.argv[1]
text = open(path, encoding="utf-8").read()

def cut(pattern, text, what):
    new, n = re.subn(pattern, "", text, flags=re.S)
    if n != 1:
        sys.exit(f"expected exactly one {what} in the manifest, found {n}")
    return new

text = cut(r'[ \t]*<receiver\s+android:name="\.MoneySmsReceiver".*?</receiver>\n', text, "MoneySmsReceiver")
text = cut(r'[ \t]*<service\s+android:name="\.MoneyListenerService".*?</service>\n', text, "MoneyListenerService")
text = cut(r'[ \t]*<uses-permission android:name="android\.permission\.RECEIVE_SMS" />\n', text, "RECEIVE_SMS permission")
open(path, "w", encoding="utf-8").write(text)
