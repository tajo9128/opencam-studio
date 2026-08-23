const DB_NAME = 'ScreenRecorderDB';
const STORE_CHUNKS = 'chunks';
const STORE_SETTINGS = 'settings';
const DB_VERSION = 2; // Upgraded for settings store

class StorageManager {
  constructor() {
    this.db = null;
  }

  init() {
    const tryOpen = () => new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_CHUNKS)) db.createObjectStore(STORE_CHUNKS, { autoIncrement: true });
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IDB open failed'));
      req.onblocked = () => reject(new Error('IDB blocked'));
    });
    return tryOpen()
      .then(db => { this.db = db; return true; })
      .catch(err => {
        console.warn('[StorageManager] reopening after failure:', err.message);
        return new Promise(resolve => {
          const del = indexedDB.deleteDatabase(DB_NAME);
          del.onsuccess = del.onerror = del.onblocked = () =>
            tryOpen().then(db => { this.db = db; resolve(true); }).catch(() => resolve(false));
        });
      });
  }

  async saveChunk(blob) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_CHUNKS], 'readwrite');
      const store = transaction.objectStore(STORE_CHUNKS);
      const request = store.add(blob);
      let key;
      request.onsuccess = () => { key = request.result; };
      transaction.oncomplete = () => resolve(key);
      transaction.onerror = () => {
        const err = transaction.error || new Error('Chunk save failed');
        if (err.name === 'QuotaExceededError') reject(new Error('STORAGE_FULL'));
        else reject(err);
      };
      transaction.onabort = () => {
        const err = transaction.error || new Error('Transaction aborted');
        if (err.name === 'QuotaExceededError') reject(new Error('STORAGE_FULL'));
        else reject(err);
      };
    });
  }

  async getAllChunks() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_CHUNKS], 'readonly');
      const store = transaction.objectStore(STORE_CHUNKS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Error retrieving chunks');
    });
  }

  async clearStorage() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_CHUNKS], 'readwrite');
      const store = transaction.objectStore(STORE_CHUNKS);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject('Error clearing storage');
    });
  }

  async setSetting(key, value) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_SETTINGS], 'readwrite');
      const store = transaction.objectStore(STORE_SETTINGS);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject('Error saving setting');
    });
  }

  async getSetting(key) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_SETTINGS], 'readonly');
      const store = transaction.objectStore(STORE_SETTINGS);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Error getting setting');
    });
  }

  async removeSetting(key) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_SETTINGS], 'readwrite');
      const store = transaction.objectStore(STORE_SETTINGS);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject('Error removing setting');
    });
  }

  async hasUnsavedData() {
    if (!this.db) return false;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(STORE_CHUNKS, 'readonly');
        const req = tx.objectStore(STORE_CHUNKS).count();
        req.onsuccess = () => resolve(req.result > 0);
        req.onerror = () => resolve(false);
      } catch { resolve(false); }
    });
  }

  async estimateQuota() {
    if (!navigator.storage?.estimate) return null;
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      return { usage, quota, percent: quota ? Math.round((usage / quota) * 100) : 0 };
    } catch { return null; }
  }
}

export const storageManager = new StorageManager();
