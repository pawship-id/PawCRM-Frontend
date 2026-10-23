/**
 * The till's on-device store (POS offline mode, 19 October 2026).
 *
 * A HAND-WRITTEN WRAPPER, not Dexie: three object stores and a dozen calls do
 * not earn a dependency, and every byte this page loads is a byte a weak
 * connection has to carry before the till can open.
 *
 *   kv     — one value per key: the device's identity, the snapshot sections,
 *            the shift, the number counters, local parked baskets
 *   queue  — the sales rung up offline, keyed by `clientTxnId`, until the
 *            server has answered for each one
 *
 * FALLS BACK TO MEMORY where IndexedDB is missing or refuses (private mode on
 * some browsers, jsdom in tests). The till still works for the session; it just
 * cannot survive a reload — which `persistent()` reports so the screen can say so.
 */

const DB_NAME = "buloo-pos";
const DB_VERSION = 1;

type StoreName = "kv" | "queue";

let opening: Promise<IDBDatabase | null> | null = null;
const memory: Record<StoreName, Map<string, unknown>> = {
  kv: new Map(),
  queue: new Map(),
};

function open(): Promise<IDBDatabase | null> {
  if (opening) return opening;

  opening = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("queue")) {
          db.createObjectStore("queue", { keyPath: "clientTxnId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return opening;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** True when what is written here survives a reload. */
export async function persistent(): Promise<boolean> {
  return (await open()) !== null;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  if (!db) return memory.kv.get(key) as T | undefined;
  return done(db.transaction("kv").objectStore("kv").get(key)) as Promise<
    T | undefined
  >;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  if (!db) {
    memory.kv.set(key, value);
    return;
  }
  await done(db.transaction("kv", "readwrite").objectStore("kv").put(value, key));
}

export async function kvDelete(key: string): Promise<void> {
  const db = await open();
  if (!db) {
    memory.kv.delete(key);
    return;
  }
  await done(db.transaction("kv", "readwrite").objectStore("kv").delete(key));
}

/**
 * Reads, changes and writes one key in ONE transaction — the counter's
 * increment. Two tabs asking for a number at once are serialised by the
 * database, so they cannot both be handed the same one.
 */
export async function kvUpdate<T>(
  key: string,
  change: (current: T | undefined) => T,
): Promise<T> {
  const db = await open();
  if (!db) {
    const next = change(memory.kv.get(key) as T | undefined);
    memory.kv.set(key, next);
    return next;
  }

  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    const store = tx.objectStore("kv");
    let next: T;
    const read = store.get(key);
    read.onsuccess = () => {
      next = change(read.result as T | undefined);
      store.put(next, key);
    };
    tx.oncomplete = () => resolve(next);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function queuePut<T extends { clientTxnId: string }>(
  record: T,
): Promise<void> {
  const db = await open();
  if (!db) {
    memory.queue.set(record.clientTxnId, record);
    return;
  }
  await done(db.transaction("queue", "readwrite").objectStore("queue").put(record));
}

export async function queueGet<T>(clientTxnId: string): Promise<T | undefined> {
  const db = await open();
  if (!db) return memory.queue.get(clientTxnId) as T | undefined;
  return done(db.transaction("queue").objectStore("queue").get(clientTxnId)) as Promise<
    T | undefined
  >;
}

export async function queueAll<T>(): Promise<T[]> {
  const db = await open();
  if (!db) return [...memory.queue.values()] as T[];
  return done(db.transaction("queue").objectStore("queue").getAll()) as Promise<T[]>;
}

export async function queueDelete(clientTxnId: string): Promise<void> {
  const db = await open();
  if (!db) {
    memory.queue.delete(clientTxnId);
    return;
  }
  await done(db.transaction("queue", "readwrite").objectStore("queue").delete(clientTxnId));
}

/** Tests only: forget everything held in memory. */
export function __resetMemoryStore(): void {
  memory.kv.clear();
  memory.queue.clear();
  opening = null;
}
