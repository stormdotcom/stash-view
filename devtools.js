// Registers the StashView panel inside Chrome/Firefox DevTools.
// This script runs in the devtools page context (not the panel itself).

chrome.devtools.panels.create(
  'StashView',
  'icons/icon32.png',
  'panel.html',
  (_panel) => {
    // Panel created — nothing extra needed here; panel.js handles everything.
  }
);
