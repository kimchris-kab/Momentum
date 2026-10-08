#!/usr/bin/env node
// Makes the key pair that lets the app trust only updates you signed.
//
//   node scripts/ota-keygen.mjs
//
// It prints two things and writes nothing:
//   - the PRIVATE key. Put it in the GitHub repository secret OTA_SIGNING_KEY and nowhere else.
//   - the PUBLIC key. Commit it as android/app/src/main/assets/ota-public-key.txt.
// With the public key in the app, an update is accepted only if it carries a signature that key
// can check, so someone who got hold of your Supabase service key still couldn't change your app.
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
console.log("=== PRIVATE KEY: the GitHub secret OTA_SIGNING_KEY. Do not commit it. ===");
console.log(privateKey.export({ type: "pkcs8", format: "pem" }).trim());
console.log("\n=== PUBLIC KEY: commit as android/app/src/main/assets/ota-public-key.txt ===");
console.log(publicKey.export({ type: "spki", format: "der" }).toString("base64"));
