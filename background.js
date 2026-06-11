// Service worker / background script for StashView.
// Handles messages from the devtools panel that require privileged APIs
// (e.g. chrome.cookies read/write/delete, cross-origin scripting).
// Stays intentionally minimal — all UI logic lives in panel.js.

// Use chrome.* directly — polyfill is loaded via manifest scripts[] on Firefox.
// On Chrome MV3, chrome.* APIs return Promises natively.
const _b = (typeof browser !== 'undefined') ? browser : chrome;

_b.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'cookies:getAll':
      _b.cookies.getAll({ url: message.url }).then(sendResponse);
      return true; // async

    case 'cookies:set':
      _b.cookies.set(message.details).then(sendResponse).catch(err => sendResponse({ error: err.message }));
      return true;

    case 'cookies:remove':
      _b.cookies.remove({ url: message.url, name: message.name }).then(sendResponse);
      return true;

    default:
      sendResponse({ error: `Unknown message type: ${message.type}` });
  }
});
