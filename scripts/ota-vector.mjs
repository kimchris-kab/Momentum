#!/usr/bin/env node
// Writes the test vector that proves the signature the Node side makes is one the Android side accepts.
//
//   node scripts/ota-vector.mjs > android/app/src/androidTest/assets/ota-vector.json
//
// A throwaway key pair is made, used once, and its private half is thrown away: what's written is the
// public key, a manifest, and the signature. The Android test checks the signature against the public key
// with the Java code the app really uses. Regenerate only if the signing payload ever changes.
import { generateKeyPairSync } from "node:crypto";
import { sha256, signManifest } from "./ota.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const body = (s) => Buffer.from(s);
const files = [
  { path: "assets/app-AbCdEf12.js", content: "console.log('hello')" },
  { path: "build.json", content: "{\"build\":\"2099-01-01T00:00:00.000Z\"}" },
  { path: "index.html", content: "<!doctype html><title>x</title>" },
].map((f) => ({ ...f, sha256: sha256(body(f.content)), size: body(f.content).length }));
const manifest = {
  app: "momentum", id: "20990101-000000Z-vector", version: "1.0.0", build: "2099-01-01T00:00:00.000Z", commit: "vector", notes: "",
  requiresNativeApi: 1, files: files.map(({ path, sha256, size }) => ({ path, sha256, size })),
};
manifest.signature = signManifest(manifest, privateKey.export({ type: "pkcs8", format: "pem" }));
console.log(JSON.stringify({
  publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  manifest,
  contents: Object.fromEntries(files.map((f) => [f.path, f.content])),
}, null, 2));
