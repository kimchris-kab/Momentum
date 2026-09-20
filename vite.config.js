import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// PREVIEW=1 builds a self-contained copy for hosting somewhere that serves the app from a
// subpath and can't register a service worker (a shared preview link, for instance):
// relative asset URLs, no PWA plugin. The normal build is unchanged.
const preview = process.env.PREVIEW === "1";

export default defineConfig({
  base: preview ? "./" : "/",
  build: preview ? {
    outDir: "dist-preview",
    // The preview is published under a fixed filename, and the lazy chunks import back into
    // the entry by name — rename it afterwards and every one of them 404s at runtime.
    rollupOptions: { output: { entryFileNames: "assets/momentum.js" } },
  } : {},
  plugins: [
    react(),
    ...(preview ? [] : [
      VitePWA({
        // injectManifest, not generateSW: notification actions need a click handler in the
        // worker, and a generated worker has nowhere to put one.
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.js",
        registerType: "autoUpdate",
        injectManifest: { globPatterns: ["**/*.{js,css,html,png,svg,woff2}"] },
        includeAssets: ["icons/*.png"],
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
          ],
        },
      }),
    ]),
  ],
});
