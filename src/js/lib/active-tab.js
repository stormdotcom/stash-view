// Storage access bridge for the popup context.
// Popup has no chrome.devtools — we inject functions via chrome.scripting.executeScript.
// The `args` parameter passes values into the injected function (no closures allowed).

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function exec(func, args = []) {
  const tab = await getActiveTab();
  const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
  if (!results || !results[0]) throw new Error('Script injection failed');
  return results[0].result;
}

export async function getActiveTabInfo() {
  const tab = await getActiveTab();
  return { id: tab.id, url: tab.url, title: tab.title, favIconUrl: tab.favIconUrl };
}

// ── localStorage ──────────────────────────────────────────────────────────────
export function getLocalStorage() {
  return exec(() => {
    const items = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      items.push({ key: k, value: localStorage.getItem(k) });
    }
    return items;
  });
}

export function setLocalStorage(key, value) {
  return exec((k, v) => localStorage.setItem(k, v), [key, value]);
}

export function removeLocalStorage(key) {
  return exec((k) => localStorage.removeItem(k), [key]);
}

export function clearLocalStorage() {
  return exec(() => localStorage.clear());
}

// ── sessionStorage ────────────────────────────────────────────────────────────
export function getSessionStorage() {
  return exec(() => {
    const items = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      items.push({ key: k, value: sessionStorage.getItem(k) });
    }
    return items;
  });
}

export function setSessionStorage(key, value) {
  return exec((k, v) => sessionStorage.setItem(k, v), [key, value]);
}

export function removeSessionStorage(key) {
  return exec((k) => sessionStorage.removeItem(k), [key]);
}

export function clearSessionStorage() {
  return exec(() => sessionStorage.clear());
}

// ── Cookies (direct API — popup has cookies permission) ───────────────────────
export async function getCookies() {
  const tab = await getActiveTab();
  return chrome.cookies.getAll({ url: tab.url });
}

export function setCookie(details) {
  return chrome.cookies.set(details);
}

export function removeCookie(url, name) {
  return chrome.cookies.remove({ url, name });
}

// ── IndexedDB ─────────────────────────────────────────────────────────────────
export function listIDBDatabases() {
  return exec(async () => {
    if (!indexedDB.databases) return [];
    return (await indexedDB.databases()).map(d => ({ name: d.name, version: d.version }));
  });
}

export function getIDBStores(dbName) {
  return exec((name) => new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => {
      const db = req.result;
      const stores = Array.from(db.objectStoreNames).map(s => {
        const tx = db.transaction(s, 'readonly');
        const st = tx.objectStore(s);
        return { name: s, keyPath: st.keyPath, autoIncrement: st.autoIncrement };
      });
      db.close();
      resolve(stores);
    };
    req.onerror = () => reject(req.error?.message ?? 'IDB open failed');
  }), [dbName]);
}

export function getIDBRecords(dbName, storeName) {
  return exec((dbN, stN) => new Promise((resolve, reject) => {
    const req = indexedDB.open(dbN);
    req.onsuccess = () => {
      const db = req.result;
      const tx   = db.transaction(stN, 'readonly');
      const store = tx.objectStore(stN);
      let recs, keys;
      store.getAll().onsuccess    = e => { recs = e.target.result; if (keys) done(); };
      store.getAllKeys().onsuccess = e => { keys = e.target.result; if (recs) done(); };
      function done() { db.close(); resolve(recs.map((v, i) => ({ key: keys[i], value: v }))); }
      tx.onerror = () => { db.close(); reject(tx.error?.message); };
    };
    req.onerror = () => reject(req.error?.message ?? 'IDB open failed');
  }), [dbName, storeName]);
}

export function deleteIDBRecord(dbName, storeName, key) {
  return exec((dbN, stN, k) => new Promise((resolve, reject) => {
    const req = indexedDB.open(dbN);
    req.onsuccess = () => {
      const db = req.result;
      const tx  = db.transaction(stN, 'readwrite');
      tx.objectStore(stN).delete(k).onsuccess = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error?.message); };
    };
    req.onerror = () => reject(req.error?.message);
  }), [dbName, storeName, key]);
}
