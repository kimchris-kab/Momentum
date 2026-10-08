import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { REQUIRES_NATIVE_API } from "./src/lib/nativeApi.js";

// Stamped into the bundle so a running copy can say which build it is, and compare itself
// against whatever has been published since.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const commit = (() => {
  try { return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return ""; }
})();

// PREVIEW=1 builds a self-contained copy for hosting somewhere that serves the app from a
// subpath and can't register a service worker (a shared preview link, for instance):
// relative asset URLs, no PWA plugin. The normal build is unchanged.
const preview = process.env.PREVIEW === "1";

// One timestamp for the whole build, so the copy baked into the code and the copy written beside it
// as build.json can never disagree about which build this is.
const BUILD = new Date().toISOString();
const buildInfo = {
  name: "momentum-build-info",
  generateBundle() {
    this.emitFile({
      type: "asset", fileName: "build.json",
      source: JSON.stringify({ app: "momentum", version: pkg.version, build: BUILD, commit, requiresNativeApi: REQUIRES_NATIVE_API }),
    });
  },
};

export default defineConfig({
  base: preview ? "./" : "/",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(BUILD),
    __APP_COMMIT__: JSON.stringify(commit),
    // Whether this build ships a service worker at all; src/swSetup.js decides where it is registered.
    __PWA__: JSON.stringify(!preview),
  },
  build: preview ? {
    outDir: "dist-preview",
    // The preview is published under a fixed filename, and the lazy chunks import back into
    // the entry by name — rename it afterwards and every one of them 404s at runtime.
    rollupOptions: { output: { entryFileNames: "assets/momentum.js" } },
  } : {},
  plugins: [
    react(),
    ...(preview ? [] : [buildInfo]),
    ...(preview ? [] : [
      VitePWA({
        // injectManifest, not generateSW: notification actions need a click handler in the
        // worker, and a generated worker has nowhere to put one.
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.js",
        registerType: "autoUpdate",
        // Registered by src/swSetup.js instead, which leaves it out of the Android app.
        injectRegister: false,
        injectManifest: { globPatterns: ["**/*.{js,css,html,png,svg,woff2}"] },
        includeAssets: ["icons/*.png", "icons/*.svg"],
        manifest: {
          name: "Momentum",
          short_name: "Momentum",
          description: "Track your seven pillars, build routines, break habits, and grow.",
          theme_color: "#14131f",
          background_color: "#14131f",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
            { src: "icons/icon.svg", sizes: "any", type: "image/svg+xml" },
          ],
        },
      }),
    ]),
  ],
});
