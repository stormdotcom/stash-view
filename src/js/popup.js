import {
  getActiveTabInfo,
  getLocalStorage, setLocalStorage, removeLocalStorage, clearLocalStorage,
  getSessionStorage, setSessionStorage, removeSessionStorage, clearSessionStorage,
  getCookies, setCookie, removeCookie,
  listIDBDatabases, getIDBStores, getIDBRecords, deleteIDBRecord,
} from './lib/active-tab.js';
import { detectType, formatBytes, tryParseJSON, escapeHtml } from './lib/format.js';
import { JsonTree } from './components/json-tree.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const faviconEl  = document.getElementById('favicon');
const originEl   = document.getElementById('origin');
const listEl     = document.getElementById('list');
const detailEl   = document.getElementById('detail');
const statusEl   = document.getElementById('status');
const searchEl   = document.getElementById('search');
const btnRefresh = document.getElementById('btn-refresh');
const btnClear   = document.getElementById('btn-clear');
const btnTheme   = document.getElementById('btn-theme');

let activeTabName = 'local';
let allRows       = [];
let tabInfo       = null;
let activeRowEl   = null;

// ── Theme ─────────────────────────────────────────────────────────────────────
async function applyTheme(theme) {
  document.body.dataset.theme = theme;
  await chrome.storage.local.set({ theme });
}

btnTheme.addEventListener('click', () => {
  applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
});

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  // Restore saved theme (default: dark)
  const { theme = 'dark' } = await chrome.storage.local.get('theme');
  document.body.dataset.theme = theme;

  // Populate header site row
  try {
    tabInfo = await getActiveTabInfo();
    const url = new URL(tabInfo.url);
    originEl.textContent = url.hostname;
    originEl.title       = tabInfo.url;
    if (tabInfo.favIconUrl) {
      faviconEl.src = tabInfo.favIconUrl;
      faviconEl.style.display = '';
    } else {
      faviconEl.style.display = 'none';
    }
  } catch {
    originEl.textContent = 'unknown origin';
  }

  await loadTab('local');
})();

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.pu-tabs__tab').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.pu-tabs__tab').forEach(b => {
      b.classList.remove('pu-tabs__tab--active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('pu-tabs__tab--active');
    btn.setAttribute('aria-selected', 'true');
    activeTabName = btn.dataset.tab;
    searchEl.value = '';
    closeDetail();
    await loadTab(activeTabName);
  });
});

btnRefresh.addEventListener('click', () => loadTab(activeTabName));
searchEl.addEventListener('input', () => filterRows(searchEl.value));

btnClear.addEventListener('click', async () => {
  if (!confirm(`Clear ALL entries in ${activeTabName}?`)) return;
  try {
    if (activeTabName === 'local')   await clearLocalStorage();
    if (activeTabName === 'session') await clearSessionStorage();
    if (activeTabName === 'cookies') {
      const all = await getCookies();
      await Promise.all(all.map(c => removeCookie(tabInfo.url, c.name)));
    }
    await loadTab(activeTabName);
    showStatus('Cleared.', 'success');
  } catch (e) { showStatus(e.message, 'error'); }
});

// ── Load tab data ─────────────────────────────────────────────────────────────
async function loadTab(name) {
  listEl.innerHTML = '<div class="pu-empty">Loading…</div>';
  closeDetail();
  try {
    switch (name) {
      case 'local':     renderStorageRows(await getLocalStorage(),   'local');    break;
      case 'session':   renderStorageRows(await getSessionStorage(), 'session');  break;
      case 'cookies':   renderCookieRows(await getCookies());                     break;
      case 'indexeddb': await renderIDB();                                        break;
    }
  } catch (e) {
    listEl.innerHTML = `<div class="pu-error">${escapeHtml(e.message)}</div>`;
  }
}

// ── localStorage / sessionStorage ────────────────────────────────────────────
function renderStorageRows(items, storageType) {
  allRows = items;
  if (!items.length) { listEl.innerHTML = '<div class="pu-empty">No entries.</div>'; return; }
  listEl.innerHTML = '';
  items.forEach(({ key, value }) => listEl.appendChild(makeStorageRow(key, value, storageType)));
}

function makeStorageRow(key, value, storageType) {
  const row  = document.createElement('div');
  row.className    = 'pu-row';
  row.dataset.key  = key;
  const type = detectType(value);
  const size = formatBytes(value ?? '');

  row.innerHTML =
    `<span class="pu-row__key" title="${escapeHtml(key)}">${escapeHtml(key)}</span>` +
    `<span class="pu-row__badge pu-row__badge--${type}">${type}</span>` +
    `<span class="pu-row__size">${size}</span>` +
    `<span class="pu-row__acts">` +
    `  <button class="pu-act-btn pu-act-btn--copy" title="Copy">⎘</button>` +
    `  <button class="pu-act-btn pu-act-btn--del"  title="Delete">✕</button>` +
    `</span>`;

  row.querySelector('.pu-act-btn--copy').addEventListener('click', e => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    showStatus('Copied to clipboard.', 'success');
  });

  row.querySelector('.pu-act-btn--del').addEventListener('click', async e => {
    e.stopPropagation();
    try {
      if (storageType === 'local')   await removeLocalStorage(key);
      if (storageType === 'session') await removeSessionStorage(key);
      row.remove();
      if (activeRowEl === row) closeDetail();
      showStatus(`Deleted "${key}".`, 'success');
    } catch (err) { showStatus(err.message, 'error'); }
  });

  row.addEventListener('click', () => {
    if (activeRowEl === row) { closeDetail(); return; }
    setActiveRow(row);
    showValueDetail(key, value, async (newVal) => {
      try {
        if (storageType === 'local')   await setLocalStorage(key, newVal);
        if (storageType === 'session') await setSessionStorage(key, newVal);
        await loadTab(storageType);
        showStatus(`Saved "${key}".`, 'success');
      } catch (err) { showStatus(err.message, 'error'); }
    });
  });

  return row;
}

// ── Cookies ───────────────────────────────────────────────────────────────────
function renderCookieRows(cookies) {
  allRows = cookies;
  if (!cookies.length) { listEl.innerHTML = '<div class="pu-empty">No cookies.</div>'; return; }
  listEl.innerHTML = '';
  cookies.forEach(c => listEl.appendChild(makeCookieRow(c)));
}

function makeCookieRow(cookie) {
  const row  = document.createElement('div');
  row.className   = 'pu-row';
  row.dataset.key = cookie.name;
  const type = detectType(cookie.value);
  const size = formatBytes(cookie.value ?? '');
  const httpOnlyFlag = cookie.httpOnly
    ? `<span class="pu-flag pu-flag--httponly">H</span>` : '';
  const secureFlag = cookie.secure
    ? `<span class="pu-flag pu-flag--secure">S</span>` : '';

  row.innerHTML =
    `<span class="pu-row__key" title="${escapeHtml(cookie.name)}">${escapeHtml(cookie.name)}</span>` +
    `<span class="pu-row__badge pu-row__badge--${type}">${type}</span>` +
    `<span class="pu-row__size">${size}</span>` +
    `<span class="pu-row__acts" style="gap:3px">` +
    httpOnlyFlag + secureFlag +
    `  <button class="pu-act-btn pu-act-btn--copy" title="Copy value">⎘</button>` +
    `  <button class="pu-act-btn pu-act-btn--del"  title="Delete">✕</button>` +
    `</span>`;

  row.querySelector('.pu-act-btn--copy').addEventListener('click', e => {
    e.stopPropagation();
    navigator.clipboard.writeText(cookie.value);
    showStatus('Copied.', 'success');
  });

  row.querySelector('.pu-act-btn--del').addEventListener('click', async e => {
    e.stopPropagation();
    try {
      await removeCookie(tabInfo.url, cookie.name);
      row.remove();
      if (activeRowEl === row) closeDetail();
      showStatus(`Deleted cookie "${cookie.name}".`, 'success');
    } catch (err) { showStatus(err.message, 'error'); }
  });

  row.addEventListener('click', e => {
    if (e.target.closest('.pu-act-btn')) return;
    if (activeRowEl === row) { closeDetail(); return; }
    setActiveRow(row);
    const expiry = cookie.expirationDate
      ? new Date(cookie.expirationDate * 1000).toLocaleString()
      : 'Session';
    const meta = `Domain: ${cookie.domain}  Path: ${cookie.path}  Expires: ${expiry}` +
      (cookie.sameSite ? `  SameSite: ${cookie.sameSite}` : '');
    showValueDetail(cookie.name, cookie.value,
      cookie.httpOnly ? null : async (newVal) => {
        try {
          await setCookie({ url: tabInfo.url, name: cookie.name, value: newVal,
            path: cookie.path, domain: cookie.domain, secure: cookie.secure,
            httpOnly: cookie.httpOnly, sameSite: cookie.sameSite,
            expirationDate: cookie.expirationDate });
          await loadTab('cookies');
          showStatus(`Saved cookie "${cookie.name}".`, 'success');
        } catch (err) { showStatus(err.message, 'error'); }
      },
      meta
    );
  });

  return row;
}

// ── IndexedDB ─────────────────────────────────────────────────────────────────
async function renderIDB() {
  const dbs = await listIDBDatabases();
  if (!dbs.length) { listEl.innerHTML = '<div class="pu-empty">No IndexedDB databases.</div>'; return; }

  listEl.innerHTML = '';
  for (const db of dbs) {
    const dbRow = document.createElement('div');
    dbRow.className = 'pu-idb-tree__db-row';
    dbRow.innerHTML =
      `<span class="pu-idb-tree__caret">▸</span>` +
      `<span>🗄 ${escapeHtml(db.name)}</span>` +
      `<span class="pu-idb-tree__badge">v${db.version}</span>`;

    let storesLoaded = false;
    let expanded = false;
    const storeContainer = document.createElement('div');

    dbRow.addEventListener('click', async () => {
      expanded = !expanded;
      dbRow.querySelector('.pu-idb-tree__caret').textContent = expanded ? '▾' : '▸';
      storeContainer.style.display = expanded ? '' : 'none';
      if (!storesLoaded && expanded) {
        storesLoaded = true;
        storeContainer.innerHTML = '<div class="pu-empty" style="padding:6px 24px">Loading…</div>';
        try {
          const stores = await getIDBStores(db.name);
          storeContainer.innerHTML = '';
          if (!stores.length) {
            storeContainer.innerHTML = '<div class="pu-empty" style="padding:6px 24px">No stores.</div>';
            return;
          }
          stores.forEach(store => {
            const stRow = document.createElement('div');
            stRow.className = 'pu-idb-tree__store-row';
            stRow.innerHTML =
              `<span class="pu-idb-tree__caret">▸</span>` +
              `<span>📋 ${escapeHtml(store.name)}</span>` +
              `<span class="pu-idb-tree__badge">key: ${escapeHtml(String(store.keyPath ?? 'none'))}</span>`;

            let recsLoaded = false, recsExpanded = false;
            const recContainer = document.createElement('div');

            stRow.addEventListener('click', async (e) => {
              e.stopPropagation();
              recsExpanded = !recsExpanded;
              stRow.querySelector('.pu-idb-tree__caret').textContent = recsExpanded ? '▾' : '▸';
              recContainer.style.display = recsExpanded ? '' : 'none';
              if (!recsLoaded && recsExpanded) {
                recsLoaded = true;
                recContainer.innerHTML = '<div class="pu-empty" style="padding:4px 40px">Loading…</div>';
                try {
                  const recs = await getIDBRecords(db.name, store.name);
                  recContainer.innerHTML = '';
                  if (!recs.length) {
                    recContainer.innerHTML = '<div class="pu-empty" style="padding:4px 40px">Empty store.</div>';
                    return;
                  }
                  recs.forEach(({ key, value }) => {
                    const r = document.createElement('div');
                    r.className = 'pu-row';
                    r.style.paddingLeft = '38px';
                    r.dataset.key = String(key);
                    const size = formatBytes(JSON.stringify(value));
                    r.innerHTML =
                      `<span class="pu-row__key">${escapeHtml(String(key))}</span>` +
                      `<span class="pu-row__badge pu-row__badge--object">record</span>` +
                      `<span class="pu-row__size">${size}</span>` +
                      `<span class="pu-row__acts">` +
                      `  <button class="pu-act-btn pu-act-btn--del" title="Delete">✕</button>` +
                      `</span>`;
                    r.querySelector('.pu-act-btn--del').addEventListener('click', async e => {
                      e.stopPropagation();
                      try {
                        await deleteIDBRecord(db.name, store.name, key);
                        r.remove();
                        showStatus(`Deleted record "${key}".`, 'success');
                      } catch (err) { showStatus(err.message, 'error'); }
                    });
                    r.addEventListener('click', e => {
                      if (e.target.closest('.pu-act-btn')) return;
                      if (activeRowEl === r) { closeDetail(); return; }
                      setActiveRow(r);
                      showValueDetail(String(key), JSON.stringify(value, null, 2), null);
                    });
                    recContainer.appendChild(r);
                  });
                } catch (err) {
                  recContainer.innerHTML = `<div class="pu-error">${escapeHtml(err.message)}</div>`;
                }
              }
            });

            storeContainer.appendChild(stRow);
            storeContainer.appendChild(recContainer);
            recContainer.style.display = 'none';
          });
        } catch (err) {
          storeContainer.innerHTML = `<div class="pu-error">${escapeHtml(err.message)}</div>`;
        }
      }
    });

    listEl.appendChild(dbRow);
    listEl.appendChild(storeContainer);
    storeContainer.style.display = 'none';
  }
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function showValueDetail(key, value, onSave, extraMeta = '') {
  detailEl.removeAttribute('hidden');

  const { parsed, isJson } = tryParseJSON(value);
  let showingRaw = !isJson;

  function render() {
    detailEl.innerHTML =
      `<div class="pu-detail__toolbar">` +
      `  <span class="pu-detail__key-label">${escapeHtml(key)}</span>` +
      (isJson ? `<button class="pu-detail__toggle-raw">${showingRaw ? 'Tree' : 'Raw'}</button>` : '') +
      (onSave  ? `<button class="pu-detail__toggle-raw" id="detail-edit-btn">Edit</button>` : '') +
      `  <button class="pu-detail__copy" id="detail-copy-btn">Copy</button>` +
      `  <button class="pu-detail__close" id="detail-close-btn">×</button>` +
      `</div>` +
      (extraMeta ? `<div class="pu-detail__body"><pre style="color:var(--text-secondary);font-size:10px;margin-bottom:6px">${escapeHtml(extraMeta)}</pre></div>` : '') +
      `<div class="pu-detail__body" id="detail-body"></div>`;

    const body = document.getElementById('detail-body');

    if (!showingRaw && isJson) {
      new JsonTree(body).render(parsed);
    } else {
      body.innerHTML = `<pre>${escapeHtml(value)}</pre>`;
    }

    detailEl.querySelector('.pu-detail__copy')?.addEventListener('click', () => {
      navigator.clipboard.writeText(value);
      showStatus('Copied.', 'success');
    });

    detailEl.querySelector('#detail-close-btn')?.addEventListener('click', closeDetail);

    detailEl.querySelector('.pu-detail__toggle-raw')?.addEventListener('click', () => {
      showingRaw = !showingRaw;
      render();
    });

    document.getElementById('detail-edit-btn')?.addEventListener('click', () => {
      showEditor(key, value, onSave);
    });
  }

  render();
}

function showEditor(key, value, onSave) {
  detailEl.innerHTML =
    `<div class="pu-detail__toolbar">` +
    `  <span class="pu-detail__key-label">${escapeHtml(key)}</span>` +
    `  <button class="pu-detail__close" id="detail-close-btn">×</button>` +
    `</div>` +
    `<div class="pu-detail__body">` +
    `  <textarea id="detail-ta" spellcheck="false" style="` +
    `    width:100%;height:90px;background:var(--bg-editor);` +
    `    border:1px solid var(--border);border-radius:3px;` +
    `    color:var(--text-primary);font-family:inherit;font-size:11px;` +
    `    padding:6px;resize:vertical;outline:none">${escapeHtml(value)}</textarea>` +
    `  <div style="display:flex;gap:6px;margin-top:6px;align-items:center">` +
    `    <button class="pu-act-btn" id="detail-save-btn" style="border-color:var(--text-success);color:var(--text-success)">Save</button>` +
    `    <button class="pu-act-btn" id="detail-cancel-btn">Cancel</button>` +
    `    <span id="detail-valid" style="font-size:10px"></span>` +
    `  </div>` +
    `</div>`;

  const ta    = document.getElementById('detail-ta');
  const valid = document.getElementById('detail-valid');

  ta.addEventListener('input', () => {
    try { JSON.parse(ta.value); valid.textContent = '✓ valid JSON'; valid.style.color = 'var(--text-success)'; }
    catch { valid.textContent = ''; }
  });

  document.getElementById('detail-save-btn').addEventListener('click', async () => {
    await onSave(ta.value);
    closeDetail();
  });

  document.getElementById('detail-cancel-btn').addEventListener('click', closeDetail);
  document.getElementById('detail-close-btn').addEventListener('click', closeDetail);
}

function closeDetail() {
  detailEl.setAttribute('hidden', '');
  detailEl.innerHTML = '';
  if (activeRowEl) { activeRowEl.classList.remove('pu-row--active'); activeRowEl = null; }
}

function setActiveRow(row) {
  if (activeRowEl) activeRowEl.classList.remove('pu-row--active');
  activeRowEl = row;
  row.classList.add('pu-row--active');
}

// ── Filter ────────────────────────────────────────────────────────────────────
function filterRows(q) {
  const lower = q.toLowerCase();
  listEl.querySelectorAll('.pu-row').forEach(row => {
    const key = (row.dataset.key ?? '').toLowerCase();
    row.style.display = key.includes(lower) ? '' : 'none';
  });
}

// ── Status bar ────────────────────────────────────────────────────────────────
let statusTimer = null;
function showStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = `pu-status${type ? ' pu-status--' + type : ''}`;
  statusEl.removeAttribute('hidden');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.setAttribute('hidden', ''), 2500);
}
