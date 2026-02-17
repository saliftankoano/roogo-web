export type PendingPhoto = { data: string; ext: string };

const DB_NAME = "roogo_pending_listing";
const STORE_NAME = "photos";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePendingPhotos(
  depositId: string,
  photos: PendingPhoto[]
): Promise<boolean> {
  if (typeof window === "undefined" || !depositId) return false;
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(photos, depositId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

export async function getPendingPhotos(depositId: string): Promise<PendingPhoto[]> {
  if (typeof window === "undefined" || !depositId) return [];
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(depositId);
    req.onsuccess = () => {
      const value = req.result;
      resolve(Array.isArray(value) ? value : []);
    };
    req.onerror = () => resolve([]);
  });
}

export async function removePendingPhotos(depositId: string): Promise<void> {
  if (typeof window === "undefined" || !depositId) return;
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(depositId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
