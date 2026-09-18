import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { queueAction } from "./lib/actionQueue.js";

// A custom service worker, because notification actions need a click handler and the
// generated one has nowhere to put it. Precaching still comes from Workbox via the
// injected manifest, so offline behaviour is unchanged.
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();
self.skipWaiting();
clientsClaim();

const SNOOZE_MS = 15 * 60 * 1000;

async function focusApp(url = "/") {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const open = all.find((c) => "focus" in c);
  if (open) { await open.focus(); return open; }
  if (self.clients.openWindow) return self.clients.openWindow(url);
  return null;
}

self.addEventListener("notificationclick", (event) => {
  const { notification, action } = event;
  const data = notification.data || {};
  notification.close();

  event.waitUntil((async () => {
    // Re-arm rather than act: a snooze is the same nudge, later.
    if (action === "snooze") {
      try {
        await self.registration.showNotification(notification.title, {
          body: notification.body,
          tag: notification.tag,
          data,
          // eslint-disable-next-line no-undef
          showTrigger: typeof TimestampTrigger !== "undefined"
            ? new TimestampTrigger(Date.now() + SNOOZE_MS) : undefined,
        });
      } catch { /* platform without triggers: the snooze is simply dropped */ }
      return;
    }

    const payload = {
      action: action || "open",
      taskId: data.taskId || null,
      date: data.date || null,
      kind: data.kind || null,
      at: Date.now(),
    };

    // If a page is already open it can apply this immediately; otherwise it waits in
    // IndexedDB until the app next starts.
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (clientsList.length && (action === "done" || action === "twoMin")) {
      clientsList.forEach((c) => c.postMessage({ type: "momentum:action", payload }));
      await focusApp();
      return;
    }

    if (action === "done" || action === "twoMin") await queueAction(payload);
    await focusApp();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
