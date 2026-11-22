// IndexedDB guard and session persistence vault for mobile storage.
// Provides a high-capacity, non-blocking storage tier (hundreds of MBs/GBs)
// preventing data loss when localStorage 5MB quota is exceeded on mobile devices.

export function hasIndexedDb(): boolean {
  if (typeof indexedDB === 'undefined') return false;
  return true;
}

const IDB_NAME = 'hermes_sessions_db';
const IDB_VERSION = 1;
const IDB_STORE = 'sessions_vault';
const SNAPSHOT_KEY = 'latest_snapshot';

function openDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * Asynchronously persists the untruncated sessions snapshot into IndexedDB.
 * Never throws.
 */
export async function saveSessionsToIndexedDb(snapshot: unknown): Promise<boolean> {
  try {
    const db = await openDatabase();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const record = {
          id: SNAPSHOT_KEY,
          timestamp: Date.now(),
          data: snapshot,
        };
        const putReq = store.put(record, SNAPSHOT_KEY);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => resolve(false);
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
      } catch (_) {
        db.close();
        resolve(false);
      }
    });
  } catch (_) {
    return false;
  }
}

/**
 * Asynchronously loads the latest persisted sessions snapshot from IndexedDB.
 * Returns null if not found or corrupted.
 */
export async function loadSessionsFromIndexedDb(): Promise<unknown | null> {
  try {
    const db = await openDatabase();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const getReq = store.get(SNAPSHOT_KEY);
        getReq.onsuccess = () => {
          const res = getReq.result;
          resolve(res?.data || null);
        };
        getReq.onerror = () => resolve(null);
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch (_) {
        db.close();
        resolve(null);
      }
    });
  } catch (_) {
    return null;
  }
}

/**
 * Clears the persisted sessions vault from IndexedDB.
 */
export async function clearIndexedDbSessions(): Promise<boolean> {
  try {
    const db = await openDatabase();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const delReq = store.delete(SNAPSHOT_KEY);
        delReq.onsuccess = () => resolve(true);
        delReq.onerror = () => resolve(false);
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
      } catch (_) {
        db.close();
        resolve(false);
      }
    });
  } catch (_) {
    return false;
  }
}
