import { listIDBDatabases, listIDBObjectStores, getIDBRecords, deleteIDBRecord } from '../lib/inspected-page.js';
import { formatBytes, escapeHtml } from '../lib/format.js';
import { JsonTree } from '../components/json-tree.js';

export class IndexedDBTab {
  constructor(listEl, detailEl) {
    this.listEl = listEl;
    this.detailEl = detailEl;
    this.items = [];
    this.jsonTree = new JsonTree(detailEl);
    this._state = { dbName: null, storeName: null };
  }

  async load() {
    this.listEl.innerHTML = '<div class="key-list__loading">Loading…</div>';
    try {
      const dbs = await listIDBDatabases();
      if (dbs?.error) throw new Error(dbs.error);
      this._renderDatabases(dbs ?? []);
    } catch (e) {
      this.listEl.innerHTML = `<div class="key-list__error">Error: ${escapeHtml(e.message)}</div>`;
    }
  }

  filter(query) {
    const q = query.toLowerCase();
    this.listEl.querySelectorAll('.key-list__row').forEach(row => {
      row.style.display = (row.dataset.key ?? '').toLowerCase().includes(q) ? '' : 'none';
    });
  }

  async clearAll() { /* no-op: IDB clear is per-store, not global */ }

  _renderDatabases(dbs) {
    this.listEl.innerHTML = '';
    if (!dbs.length) { this.listEl.innerHTML = '<div class="key-list__empty">No IndexedDB databases</div>'; return; }
    dbs.forEach(db => {
      const row = document.createElement('div');
      row.className = 'key-list__row key-list__row--db';
      row.dataset.key = db.name;
      row.tabIndex = 0;
      row.innerHTML =
        `<span class="key-list__icon">🗄</span>` +
        `<span class="key-list__key">${escapeHtml(db.name)}</span>` +
        `<span class="key-list__badge">v${db.version}</span>`;
      row.addEventListener('click', () => this._loadStores(db.name));
      row.addEventListener('keydown', e => { if (e.key === 'Enter') this._loadStores(db.name); });
      this.listEl.appendChild(row);
    });
  }

  async _loadStores(dbName) {
    this._state.dbName = dbName;
    this.detailEl.innerHTML = '';
    try {
      const stores = await listIDBObjectStores(dbName);
      this._renderStores(dbName, stores);
    } catch (e) {
      this.detailEl.innerHTML = `<div class="detail__error">Error: ${escapeHtml(e.message)}</div>`;
    }
  }

  _renderStores(dbName, stores) {
    this.detailEl.innerHTML = `<div class="detail__heading">${escapeHtml(dbName)}</div>`;
    const ul = document.createElement('ul');
    ul.className = 'idb-store-list';
    stores.forEach(store => {
      const li = document.createElement('li');
      li.className = 'idb-store-list__item';
      li.innerHTML =
        `<button class="idb-store-list__btn">${escapeHtml(store.name)}</button>` +
        `<span class="idb-store-list__meta">keyPath: ${escapeHtml(String(store.keyPath))} | indexes: ${store.indexes.length}</span>`;
      li.querySelector('button').addEventListener('click', () => this._loadRecords(dbName, store.name));
      ul.appendChild(li);
    });
    this.detailEl.appendChild(ul);
  }

  async _loadRecords(dbName, storeName) {
    this._state.dbName = dbName;
    this._state.storeName = storeName;
    try {
      const records = await getIDBRecords(dbName, storeName);
      this._renderRecords(records);
    } catch (e) {
      this.listEl.innerHTML = `<div class="key-list__error">Error: ${escapeHtml(e.message)}</div>`;
    }
  }

  _renderRecords(records) {
    this.listEl.innerHTML = '';
    if (!records.length) { this.listEl.innerHTML = '<div class="key-list__empty">No records</div>'; return; }
    records.forEach(({ key, value }) => {
      const row = document.createElement('div');
      row.className = 'key-list__row';
      row.dataset.key = String(key);
      row.tabIndex = 0;
      const size = formatBytes(JSON.stringify(value));
      row.innerHTML =
        `<span class="key-list__key">${escapeHtml(String(key))}</span>` +
        `<span class="key-list__badge">record</span>` +
        `<span class="key-list__size">${size}</span>` +
        `<span class="key-list__actions">` +
        `  <button class="key-list__btn key-list__btn--danger" data-action="delete" title="Delete">✕</button>` +
        `</span>`;
      row.addEventListener('click', e => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action === 'delete') { this._deleteRecord(key); return; }
        this.jsonTree.render(value);
        this.listEl.querySelectorAll('.key-list__row').forEach(r => r.classList.remove('key-list__row--selected'));
        row.classList.add('key-list__row--selected');
      });
      row.addEventListener('keydown', e => {
        if (e.key === 'Delete') this._deleteRecord(key);
        if (e.key === 'Enter') this.jsonTree.render(value);
      });
      this.listEl.appendChild(row);
    });
  }

  async _deleteRecord(key) {
    const { dbName, storeName } = this._state;
    await deleteIDBRecord(dbName, storeName, key);
    await this._loadRecords(dbName, storeName);
  }
}
