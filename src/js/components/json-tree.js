// Collapsible, syntax-highlighted JSON tree component.
// Usage: new JsonTree(container).render(value)

import { escapeHtml } from '../lib/format.js';

export class JsonTree {
  constructor(container) {
    this.container = container;
  }

  render(value) {
    this.container.innerHTML = '';
    const pre = document.createElement('pre');
    pre.className = 'json-tree';
    pre.innerHTML = this._renderValue(value, 0);
    this.container.appendChild(pre);
    this._bindToggle(pre);
    this._bindCopy(pre);
  }

  _renderValue(val, depth) {
    if (val === null) return `<span class="json-tree__null">null</span>`;
    switch (typeof val) {
      case 'boolean': return `<span class="json-tree__bool">${val}</span>`;
      case 'number':  return `<span class="json-tree__num">${val}</span>`;
      case 'string':  return `<span class="json-tree__str">"${escapeHtml(val)}"</span>`;
      case 'object':
        if (Array.isArray(val)) return this._renderArray(val, depth);
        return this._renderObject(val, depth);
      default: return escapeHtml(String(val));
    }
  }

  _renderObject(obj, depth) {
    const entries = Object.entries(obj);
    if (entries.length === 0) return `<span class="json-tree__brace">{}</span>`;
    const id = `jt-${Math.random().toString(36).slice(2)}`;
    const items = entries.map(([k, v]) =>
      `<span class="json-tree__entry">` +
      `<span class="json-tree__key">"${escapeHtml(k)}"</span>` +
      `<span class="json-tree__colon">: </span>` +
      this._renderValue(v, depth + 1) +
      `<button class="json-tree__copy-btn" data-value="${escapeHtml(JSON.stringify(v))}" title="Copy value">⎘</button>` +
      `</span>`
    ).join(',\n');
    return `<span class="json-tree__toggle" data-target="${id}">▾</span>` +
      `<span class="json-tree__brace">{</span>` +
      `<span class="json-tree__block" id="${id}">\n${items}\n</span>` +
      `<span class="json-tree__brace">}</span>`;
  }

  _renderArray(arr, depth) {
    if (arr.length === 0) return `<span class="json-tree__brace">[]</span>`;
    const id = `jt-${Math.random().toString(36).slice(2)}`;
    const items = arr.map((v, i) =>
      `<span class="json-tree__entry">` +
      this._renderValue(v, depth + 1) +
      `<button class="json-tree__copy-btn" data-value="${escapeHtml(JSON.stringify(v))}" title="Copy value">⎘</button>` +
      `</span>`
    ).join(',\n');
    return `<span class="json-tree__toggle" data-target="${id}">▾</span>` +
      `<span class="json-tree__brace">[</span>` +
      `<span class="json-tree__block" id="${id}">\n${items}\n</span>` +
      `<span class="json-tree__brace">]</span>`;
  }

  _bindToggle(root) {
    root.addEventListener('click', e => {
      const toggle = e.target.closest('.json-tree__toggle');
      if (!toggle) return;
      const block = document.getElementById(toggle.dataset.target);
      if (!block) return;
      const collapsed = block.style.display === 'none';
      block.style.display = collapsed ? '' : 'none';
      toggle.textContent = collapsed ? '▾' : '▸';
    });
  }

  _bindCopy(root) {
    root.addEventListener('click', e => {
      const btn = e.target.closest('.json-tree__copy-btn');
      if (!btn) return;
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.value).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = orig; }, 1000);
      });
    });
  }
}
