// Actions taken from a notification while the app is closed have nowhere to go: a service
// worker cannot touch localStorage, and there may be no page open to tell. So they land in
// IndexedDB and the app drains the queue the next time it starts.
//
// Shared by the service worker and the app, so it must not import anything DOM-specific.
const DB_NAME = "momentum-actions";
const STORE = "queue";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no indexedDB")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueAction(action) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).add({ ...action, queuedAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    // A queued tap that cannot be stored is lost, which is bad but survivable — better than
    // taking down the notification handler.
    return false;
  }
}

export async function drainActions() {
  try {
    const db = await openDb();
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    if (rows.length) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
    db.close();
    return rows;
  } catch {
    return [];
  }
}
