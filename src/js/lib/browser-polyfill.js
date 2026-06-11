// Vendored stub for webextension-polyfill.
// Replace with the real build from:
//   https://github.com/mozilla/webextension-polyfill/releases
// Download browser-polyfill.min.js and place it here.
// The real polyfill provides a Promise-based browser.* API on Chrome too.

if (typeof globalThis.browser === 'undefined') {
  globalThis.browser = globalThis.chrome;
}
