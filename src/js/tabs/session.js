import { getSessionStorage, setSessionStorage, removeSessionStorage, clearSessionStorage } from '../lib/inspected-page.js';
import { detectType, formatBytes, tryParseJSON, escapeHtml } from '../lib/format.js';
import { JsonTree } from '../components/json-tree.js';

export class SessionTab {
  constructor(listEl, detailEl) {
    this.listEl = listEl;
    this.detailEl = detailEl;
    this.items = [];
    this.jsonTree = new JsonTree(detailEl);
  }

  async load() {
    try {
      this.items = await getSessionStorage() ?? [];
    } catch (e) {
      this.items = [];
      this.detailEl.innerHTML = `<div class="detail__error">Error: ${escapeHtml(e.message)}</div>`;
    }
    this._render();
  }

  filter(query) {
    const q = query.toLowerCase();
    this.listEl.querySelectorAll('.key-list__row').forEach(row => {
      row.style.display = row.dataset.key.toLowerCase().includes(q) ? '' : 'none';
    });
  }

  async clearAll() { await clearSessionStorage(); }

  _render() {
    this.listEl.innerHTML = '';
    if (!this.items.length) {
      this.listEl.innerHTML = '<div class="key-list__empty">No entries</div>';
      return;
    }
    this.items.forEach(({ key, value }) => {
      const row = document.createElement('div');
      row.className = 'key-list__row';
      row.dataset.key = key;
      row.setAttribute('role', 'row');
      row.tabIndex = 0;
      const type = detectType(value);
      const size = formatBytes(value ?? '');
      row.innerHTML =
        `<span class="key-list__key" title="${escapeHtml(key)}">${escapeHtml(key)}</span>` +
        `<span class="key-list__badge key-list__badge--${type}">${type}</span>` +
        `<span class="key-list__size">${size}</span>` +
        `<span class="key-list__actions">` +
        `  <button class="key-list__btn" data-action="edit" title="Edit">✎</button>` +
        `  <button class="key-list__btn key-list__btn--danger" data-action="delete" title="Delete (Del)">✕</button>` +
        `</span>`;
      row.addEventListener('click', e => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action === 'delete') { this._deleteItem(key); return; }
        if (action === 'edit') { this._showEditor(key, value); return; }
        this._showDetail(key, value);
        this.listEl.querySelectorAll('.key-list__row').forEach(r => r.classList.remove('key-list__row--selected'));
        row.classList.add('key-list__row--selected');
      });
      row.addEventListener('keydown', e => {
        if (e.key === 'Delete') this._deleteItem(key);
        if (e.key === 'Enter') this._showDetail(key, value);
      });
      this.listEl.appendChild(row);
    });
  }

  _showDetail(key, value) {
    const { parsed, isJson } = tryParseJSON(value);
    if (isJson) {
      this.jsonTree.render(parsed);
    } else {
      this.detailEl.innerHTML = `<pre class="detail__raw">${escapeHtml(value)}</pre>`;
    }
    const copyBtn = document.createElement('button');
    copyBtn.className = 'detail__copy-btn';
    copyBtn.textContent = 'Copy value';
    copyBtn.onclick = () => navigator.clipboard.writeText(value).then(() => { copyBtn.textContent = 'Copied!'; setTimeout(() => copyBtn.textContent = 'Copy value', 1200); });
    this.detailEl.prepend(copyBtn);
  }

  _showEditor(key, value) {
    this.detailEl.innerHTML =
      `<div class="detail__editor">` +
      `<label class="detail__label">Key</label>` +
      `<input class="detail__input detail__input--key" value="${escapeHtml(key)}" readonly>` +
      `<label class="detail__label">Value</label>` +
      `<textarea class="detail__textarea" spellcheck="false">${escapeHtml(value)}</textarea>` +
      `<div class="detail__editor-actions">` +
      `  <button class="detail__btn detail__btn--save">Save</button>` +
      `  <button class="detail__btn detail__btn--cancel">Cancel</button>` +
      `  <span class="detail__validation"></span>` +
      `</div></div>`;
    const textarea = this.detailEl.querySelector('.detail__textarea');
    const saveBtn  = this.detailEl.querySelector('.detail__btn--save');
    const cancelBtn = this.detailEl.querySelector('.detail__btn--cancel');
    const validation = this.detailEl.querySelector('.detail__validation');
    textarea.addEventListener('input', () => {
      try { JSON.parse(textarea.value); validation.textContent = '✓ valid JSON'; validation.className = 'detail__validation detail__validation--ok'; }
      catch { validation.textContent = ''; }
    });
    saveBtn.addEventListener('click', async () => {
      await setSessionStorage(key, textarea.value);
      await this.load();
    });
    cancelBtn.addEventListener('click', () => this._showDetail(key, value));
  }

  async _deleteItem(key) {
    await removeSessionStorage(key);
    await this.load();
  }
}
