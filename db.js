// IndexedDB wrapper — all app data lives here (no localStorage).
const DB_NAME = 'bread-note';
// v2: batches ストアを追加（既存のストアには触れない）
const DB_VERSION = 2;

export const STORES = ['recipes', 'recipeVersions', 'bakes', 'photos', 'meta', 'batches'];

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
      // v2（まとめて作る）
      if (!db.objectStoreNames.contains('batches')) db.createObjectStore('batches', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // 別のタブで新しい版が開かれたら閉じて、DB の更新を妨げない
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
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

/**
 * 複数のストアへの書き込み・削除を1つのトランザクションで行う（すべて成功するか、何も書かれないか）。
 * puts: [[store, value], ...]  dels: [[store, key], ...]
 */
export async function putMany(puts = [], dels = []) {
  const db = await openDB();
  const names = [...new Set([...puts.map((x) => x[0]), ...dels.map((x) => x[0])])];
  if (!names.length) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('保存を中止しました'));
    try {
      for (const [n, v] of puts) tx.objectStore(n).put(v);
      for (const [n, k] of dels) tx.objectStore(n).delete(k);
    } catch (e) { try { tx.abort(); } catch { /* */ } reject(e); }
  });
}
