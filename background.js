// Service worker / background script for StashView.
// Handles messages from the devtools panel that require privileged APIs
// (e.g. chrome.cookies read/write/delete, cross-origin scripting).
// Stays intentionally minimal — all UI logic lives in panel.js.

import './src/js/lib/browser-polyfill.js';

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'cookies:getAll':
      browser.cookies.getAll({ url: message.url }).then(sendResponse);
      return true; // async

    case 'cookies:set':
      browser.cookies.set(message.details).then(sendResponse).catch(err => sendResponse({ error: err.message }));
      return true;

    case 'cookies:remove':
      browser.cookies.remove({ url: message.url, name: message.name }).then(sendResponse);
      return true;

    default:
      sendResponse({ error: `Unknown message type: ${message.type}` });
  }
});
