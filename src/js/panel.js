// Entry point for the StashView DevTools panel.
// Bootstraps theme, wires tabs, manages the master-detail split and keyboard nav.

import { LocalTab } from './tabs/local.js';
import { SessionTab } from './tabs/session.js';
import { CookiesTab } from './tabs/cookies.js';
import { IndexedDBTab } from './tabs/indexeddb.js';

// ── Theme ─────────────────────────────────────────────────────────────────────
const theme = (chrome.devtools.panels.themeName === 'dark') ? 'dark' : 'light';
document.body.dataset.theme = theme;
document.body.className = `theme--${theme}`;

// ── Tab registry ──────────────────────────────────────────────────────────────
const keyListEl  = document.getElementById('key-list');
const detailEl   = document.getElementById('detail');
const searchEl   = document.querySelector('.toolbar__search');
const refreshBtn = document.querySelector('.toolbar__btn--refresh');
const clearBtn   = document.querySelector('.toolbar__btn--clear');

const tabs = {
  local:     new LocalTab(keyListEl, detailEl),
  session:   new SessionTab(keyListEl, detailEl),
  cookies:   new CookiesTab(keyListEl, detailEl),
  indexeddb: new IndexedDBTab(keyListEl, detailEl),
};

let activeTab = tabs.local;
await activeTab.load();

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tabs__tab').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.tabs__tab').forEach(b => {
      b.classList.remove('tabs__tab--active');
      b.setAttribute('aria-selected', 'false');
      b.tabIndex = -1;
    });
    btn.classList.add('tabs__tab--active');
    btn.setAttribute('aria-selected', 'true');
    btn.tabIndex = 0;

    const tabKey = btn.dataset.tab;
    activeTab = tabs[tabKey];
    searchEl.value = '';
    await activeTab.load();
  });
});

// ── Search / filter ───────────────────────────────────────────────────────────
searchEl.addEventListener('input', () => activeTab.filter(searchEl.value));

// ── Toolbar buttons ───────────────────────────────────────────────────────────
refreshBtn.addEventListener('click', () => activeTab.load());
clearBtn.addEventListener('click', async () => {
  if (confirm('Clear all entries in this storage?')) {
    await activeTab.clearAll();
    await activeTab.load();
  }
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== searchEl) {
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
  }
  if (e.key === 'r' && document.activeElement !== searchEl) {
    activeTab.load();
  }
});

// ── Resizable split ───────────────────────────────────────────────────────────
const splitEl   = document.getElementById('split');
const dividerEl = document.getElementById('split-divider');
const listPane  = document.getElementById('key-list-pane');

let dragging = false;
dividerEl.addEventListener('mousedown', e => { dragging = true; e.preventDefault(); });
document.addEventListener('mousemove', e => {
  if (!dragging) return;
  const rect = splitEl.getBoundingClientRect();
  const pct  = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0.2), 0.8);
  listPane.style.width = `${pct * 100}%`;
});
document.addEventListener('mouseup', () => { dragging = false; });
