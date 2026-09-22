// IndexedDB wrapper — all app data lives here (no localStorage).
const DB_NAME = 'bread-note';
const DB_VERSION = 1;

export const STORES = ['recipes', 'recipeVersions', 'bakes', 'photos', 'meta'];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('recipes')) db.createObjectStore('recipes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('recipeVersions')) {
        const s = db.createObjectStore('recipeVersions', { keyPath: 'id' });
        s.createIndex('recipeId', 'recipeId');
      }
      if (!db.objectStoreNames.contains('bakes')) {
        const s = db.createObjectStore('bakes', { keyPath: 'id' });
        s.createIndex('recipeId', 'recipeId');
      }
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('bakeId', 'bakeId');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqP(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function getAll(name) { return reqP((await store(name)).getAll()); }
export async function get(name, key) { return reqP((await store(name)).get(key)); }
export async function put(name, value) { return reqP((await store(name, 'readwrite')).put(value)); }
export async function del(name, key) { return reqP((await store(name, 'readwrite')).delete(key)); }
export async function clear(name) { return reqP((await store(name, 'readwrite')).clear()); }
export async function getByIndex(name, index, key) {
  return reqP((await store(name)).index(index).getAll(key));
}
