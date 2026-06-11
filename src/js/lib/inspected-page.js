// Bridge to run code in the inspected page's origin context.
// localStorage, sessionStorage, and IndexedDB are only accessible from
// the page's own origin, so we must use eval or injected scripts.

const tabId = chrome.devtools.inspectedWindow.tabId;

/**
 * Evaluate an expression in the context of the inspected page.
 * Returns a Promise that resolves with { result } or rejects with { error }.
 */
export function evalInPage(expression) {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(expression, (result, exceptionInfo) => {
      if (exceptionInfo && exceptionInfo.isException) {
        reject(new Error(exceptionInfo.value));
      } else if (exceptionInfo && exceptionInfo.isError) {
        reject(new Error(exceptionInfo.description));
      } else {
        resolve(result);
      }
    });
  });
}

/** Get all localStorage entries as { key, value }[] */
export async function getLocalStorage() {
  return evalInPage(`
    (function() {
      const items = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        items.push({ key: k, value: localStorage.getItem(k) });
      }
      return items;
    })()
  `);
}

/** Set a localStorage item */
export async function setLocalStorage(key, value) {
  const safeKey = JSON.stringify(key);
  const safeVal = JSON.stringify(value);
  return evalInPage(`localStorage.setItem(${safeKey}, ${safeVal})`);
}

/** Remove a localStorage item */
export async function removeLocalStorage(key) {
  const safeKey = JSON.stringify(key);
  return evalInPage(`localStorage.removeItem(${safeKey})`);
}

/** Clear all localStorage */
export async function clearLocalStorage() {
  return evalInPage(`localStorage.clear()`);
}

/** Get all sessionStorage entries as { key, value }[] */
export async function getSessionStorage() {
  return evalInPage(`
    (function() {
      const items = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        items.push({ key: k, value: sessionStorage.getItem(k) });
      }
      return items;
    })()
  `);
}

/** Set a sessionStorage item */
export async function setSessionStorage(key, value) {
  const safeKey = JSON.stringify(key);
  const safeVal = JSON.stringify(value);
  return evalInPage(`sessionStorage.setItem(${safeKey}, ${safeVal})`);
}

/** Remove a sessionStorage item */
export async function removeSessionStorage(key) {
  const safeKey = JSON.stringify(key);
  return evalInPage(`sessionStorage.removeItem(${safeKey})`);
}

/** Clear all sessionStorage */
export async function clearSessionStorage() {
  return evalInPage(`sessionStorage.clear()`);
}

/** List IndexedDB database names */
export async function listIDBDatabases() {
  return evalInPage(`
    (async function() {
      if (!indexedDB.databases) return { error: 'indexedDB.databases() not supported' };
      try {
        const dbs = await indexedDB.databases();
        return dbs.map(d => ({ name: d.name, version: d.version }));
      } catch(e) { return { error: e.message }; }
    })()
  `);
}

/** List object stores and their metadata for a given database */
export async function listIDBObjectStores(dbName) {
  const safeName = JSON.stringify(dbName);
  return evalInPage(`
    (function() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(${safeName});
        req.onsuccess = () => {
          const db = req.result;
          const stores = Array.from(db.objectStoreNames).map(name => {
            const tx = db.transaction(name, 'readonly');
            const store = tx.objectStore(name);
            const indexes = Array.from(store.indexNames).map(iName => {
              const idx = store.index(iName);
              return { name: iName, keyPath: idx.keyPath, unique: idx.unique, multiEntry: idx.multiEntry };
            });
            return { name, keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes };
          });
          db.close();
          resolve(stores);
        };
        req.onerror = () => reject(req.error.message);
      });
    })()
  `);
}

/** Get all records from an object store */
export async function getIDBRecords(dbName, storeName) {
  const safeName = JSON.stringify(dbName);
  const safeStore = JSON.stringify(storeName);
  return evalInPage(`
    (function() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(${safeName});
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction(${safeStore}, 'readonly');
            const store = tx.objectStore(${safeStore});
            const allReq = store.getAll();
            const keyReq = store.getAllKeys();
            let records, keys;
            allReq.onsuccess = () => { records = allReq.result; if (keys) { db.close(); resolve(records.map((v,i) => ({ key: keys[i], value: v }))); }};
            keyReq.onsuccess = () => { keys = keyReq.result; if (records) { db.close(); resolve(records.map((v,i) => ({ key: keys[i], value: v }))); }};
            allReq.onerror = () => { db.close(); reject(allReq.error.message); };
          } catch(e) { db.close(); reject(e.message); }
        };
        req.onerror = () => reject(req.error.message);
      });
    })()
  `);
}

/** Delete a record by key from an object store */
export async function deleteIDBRecord(dbName, storeName, key) {
  const safeName = JSON.stringify(dbName);
  const safeStore = JSON.stringify(storeName);
  const safeKey = JSON.stringify(key);
  return evalInPage(`
    (function() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(${safeName});
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction(${safeStore}, 'readwrite');
            const store = tx.objectStore(${safeStore});
            const delReq = store.delete(${safeKey});
            delReq.onsuccess = () => { db.close(); resolve(true); };
            delReq.onerror = () => { db.close(); reject(delReq.error.message); };
          } catch(e) { db.close(); reject(e.message); }
        };
        req.onerror = () => reject(req.error.message);
      });
    })()
  `);
}
