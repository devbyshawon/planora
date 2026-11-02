const name = "planora-offline-v1";
export async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("data");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Offline storage is unavailable. Your server data is unchanged."));
  });
}
export async function readOffline() {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("data", "readonly"), request = tx.objectStore("data").get("workspace");
      let value;
      request.onsuccess = () => { value = request.result; };
      tx.oncomplete = () => resolve(value || null);
      tx.onerror = () => reject(new Error("Could not read offline storage."));
      tx.onabort = () => reject(new Error("Offline storage read was interrupted. Try again."));
    });
  } finally { db.close(); }
}
export async function writeOffline(value) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("data", "readwrite");
      if (value) tx.objectStore("data").put(value, "workspace");
      else tx.objectStore("data").delete("workspace");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(new Error("Could not save on this device. Storage may be full. Export a backup and free space."));
      tx.onabort = () => reject(new Error("Offline save was interrupted. Try again."));
    });
  } finally { db.close(); }
}
export function offlineLock(action) {
  if (!navigator.locks) throw new Error("This browser needs Web Locks support for safe offline editing. Use a current Chrome, Edge, or Safari browser.");
  return navigator.locks.request("planora-offline-workspace", action);
}
