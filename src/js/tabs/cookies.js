import { detectType, formatBytes, tryParseJSON, escapeHtml } from '../lib/format.js';
import { JsonTree } from '../components/json-tree.js';

export class CookiesTab {
  constructor(listEl, detailEl) {
    this.listEl = listEl;
    this.detailEl = detailEl;
    this.items = [];
    this.jsonTree = new JsonTree(detailEl);
  }

  async load() {
    try {
      const tabUrl = await this._getTabUrl();
      this.tabUrl = tabUrl;
      this.items = await new Promise(resolve =>
        chrome.runtime.sendMessage({ type: 'cookies:getAll', url: tabUrl }, resolve)
      ) ?? [];
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

  async clearAll() {
    await Promise.all(this.items.map(c =>
      new Promise(resolve =>
        chrome.runtime.sendMessage({ type: 'cookies:remove', url: this.tabUrl, name: c.name }, resolve)
      )
    ));
  }

  _getTabUrl() {
    // Avoids needing the `tabs` permission; reads href from the page context instead.
    return new Promise((resolve, reject) => {
      chrome.devtools.inspectedWindow.eval('window.location.href', (result, err) => {
        if (err) reject(new Error(err.value ?? 'Could not get page URL'));
        else resolve(result);
      });
    });
  }

  _render() {
    this.listEl.innerHTML = '';
    if (!this.items.length) {
      this.listEl.innerHTML = '<div class="key-list__empty">No cookies</div>';
      return;
    }
    this.items.forEach(cookie => {
      const row = document.createElement('div');
      row.className = 'key-list__row';
      row.dataset.key = cookie.name;
      row.setAttribute('role', 'row');
      row.tabIndex = 0;
      const type = detectType(cookie.value);
      const size = formatBytes(cookie.value ?? '');
      const flags = [
        cookie.httpOnly ? 'HttpOnly' : null,
        cookie.secure   ? 'Secure'   : null,
        cookie.sameSite ? `SameSite=${cookie.sameSite}` : null,
      ].filter(Boolean).join(' ');
      row.innerHTML =
        `<span class="key-list__key" title="${escapeHtml(cookie.name)}">${escapeHtml(cookie.name)}</span>` +
        `<span class="key-list__badge key-list__badge--${type}">${type}</span>` +
        `<span class="key-list__size">${size}</span>` +
        `<span class="key-list__flags">${escapeHtml(flags)}</span>` +
        `<span class="key-list__actions">` +
        (cookie.httpOnly ? '' : `<button class="key-list__btn" data-action="edit" title="Edit">✎</button>`) +
        `  <button class="key-list__btn key-list__btn--danger" data-action="delete" title="Delete">✕</button>` +
        `</span>`;
      row.addEventListener('click', e => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action === 'delete') { this._deleteItem(cookie); return; }
        if (action === 'edit')   { this._showEditor(cookie); return; }
        this._showDetail(cookie);
        this.listEl.querySelectorAll('.key-list__row').forEach(r => r.classList.remove('key-list__row--selected'));
        row.classList.add('key-list__row--selected');
      });
      row.addEventListener('keydown', e => {
        if (e.key === 'Delete') this._deleteItem(cookie);
        if (e.key === 'Enter') this._showDetail(cookie);
      });
      this.listEl.appendChild(row);
    });
  }

  _showDetail(cookie) {
    const expiry = cookie.expirationDate
      ? new Date(cookie.expirationDate * 1000).toISOString()
      : 'session';
    const meta = [
      `Domain: ${cookie.domain}`,
      `Path: ${cookie.path}`,
      `Expires: ${expiry}`,
      cookie.httpOnly ? 'HttpOnly' : null,
      cookie.secure   ? 'Secure' : null,
      cookie.sameSite ? `SameSite: ${cookie.sameSite}` : null,
    ].filter(Boolean).join('\n');
    const { parsed, isJson } = tryParseJSON(cookie.value);
    this.detailEl.innerHTML = `<pre class="detail__meta">${escapeHtml(meta)}</pre>`;
    const valueSection = document.createElement('div');
    this.detailEl.appendChild(valueSection);
    if (isJson) {
      new JsonTree(valueSection).render(parsed);
    } else {
      valueSection.innerHTML = `<pre class="detail__raw">${escapeHtml(cookie.value)}</pre>`;
    }
    if (cookie.httpOnly) {
      const note = document.createElement('div');
      note.className = 'detail__note';
      note.textContent = 'HttpOnly — value not editable via JS';
      this.detailEl.appendChild(note);
    }
    const copyBtn = document.createElement('button');
    copyBtn.className = 'detail__copy-btn';
    copyBtn.textContent = 'Copy value';
    copyBtn.onclick = () => navigator.clipboard.writeText(cookie.value).then(() => { copyBtn.textContent = 'Copied!'; setTimeout(() => copyBtn.textContent = 'Copy value', 1200); });
    this.detailEl.prepend(copyBtn);
  }

  _showEditor(cookie) {
    this.detailEl.innerHTML =
      `<div class="detail__editor">` +
      `<label class="detail__label">Name</label>` +
      `<input class="detail__input detail__input--key" value="${escapeHtml(cookie.name)}" readonly>` +
      `<label class="detail__label">Value</label>` +
      `<textarea class="detail__textarea" spellcheck="false">${escapeHtml(cookie.value)}</textarea>` +
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
      const details = { url: this.tabUrl, name: cookie.name, value: textarea.value, path: cookie.path, domain: cookie.domain, secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, expirationDate: cookie.expirationDate };
      await new Promise(resolve => chrome.runtime.sendMessage({ type: 'cookies:set', details }, resolve));
      await this.load();
    });
    cancelBtn.addEventListener('click', () => this._showDetail(cookie));
  }

  async _deleteItem(cookie) {
    await new Promise(resolve =>
      chrome.runtime.sendMessage({ type: 'cookies:remove', url: this.tabUrl, name: cookie.name }, resolve)
    );
    await this.load();
  }
}
