// ===========================================================================
// Hide Sold Out — popup.
//
// Two jobs: report what the active tab found, and move the mode. Writing the
// mode to chrome.storage.sync is the whole of the second job — every open
// mistore.pk tab has a storage listener and repaints itself. The popup never
// touches a page directly and never reloads one.
// ===========================================================================

(function () {
  'use strict';

  const DEFAULT_MODE = 'hide';

  const HINTS = {
    hide: 'Sold-out products are removed from the grid. The grid closes up behind them.',
    peek: 'Sold-out products stay in place, dimmed and greyed. Hover one to read it.'
  };

  const els = {
    count: document.getElementById('count'),
    context: document.getElementById('context'),
    hint: document.getElementById('hint'),
    hide: document.getElementById('mode-hide'),
    peek: document.getElementById('mode-peek')
  };

  // ----------------------------------------------------------------- the mode
  function paintMode(mode) {
    els.hide.setAttribute('aria-pressed', String(mode === 'hide'));
    els.peek.setAttribute('aria-pressed', String(mode === 'peek'));
    els.hint.textContent = HINTS[mode] || HINTS[DEFAULT_MODE];
  }

  function setMode(mode) {
    paintMode(mode);
    chrome.storage.sync.set({ mode });
  }

  els.hide.addEventListener('click', () => setMode('hide'));
  els.peek.addEventListener('click', () => setMode('peek'));

  chrome.storage.sync.get({ mode: DEFAULT_MODE }, ({ mode }) => paintMode(mode));

  // ---------------------------------------------------------------- the count
  // sendMessage rejects when there is no content script in the tab — a tab on
  // another site, or a mistore.pk tab that was already open when the extension
  // was installed. Neither is an error worth showing as one; the popup just
  // says what it can see.
  function idle(text) {
    els.count.textContent = '—';
    els.context.textContent = text;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) return idle('no active tab');

    if (!/^https?:\/\/(www\.)?mistore\.pk\//.test(tab.url || '') &&
        !/^https?:\/\/mistorepk\.myshopify\.com\//.test(tab.url || '')) {
      return idle('open mistore.pk to see a count');
    }

    chrome.tabs.sendMessage(tab.id, { type: 'mshs:count' }, res => {
      if (chrome.runtime.lastError || !res) return idle('reload the page to count');
      els.count.textContent = String(res.count);
      els.context.textContent = `of ${res.total} on this page`;
    });
  });
})();
