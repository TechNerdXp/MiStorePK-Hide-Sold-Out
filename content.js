// ===========================================================================
// Hide Sold Out — content script for mistore.pk (Shopify Dawn theme).
//
// Tags sold-out product cards with one class and lets content.css decide what
// that means. The mode lives in chrome.storage.sync, so the popup's toggle is
// applied by a storage listener here rather than by a reload — change it in one
// tab and every open mistore.pk tab follows.
//
// Silent by design. This runs on a site we do not own, inside a
// MutationObserver, on every page: console noise here is noise in someone
// else's devtools. DEBUG stays false in anything that ships.
// ===========================================================================

(function () {
  'use strict';

  const DEBUG = false;
  const log = (...args) => { if (DEBUG) console.log('[hide-sold-out]', ...args); };

  const SOLD = 'mshs-sold';
  const LABEL = 'mshs-sold-label';
  const MODES = { hide: 'mshs-mode-hide', peek: 'mshs-mode-peek' };
  const DEFAULT_MODE = 'hide';

  // The card wrapper. Dawn puts every product tile in one of these, in both the
  // collection grids and the homepage sliders.
  const CARD = 'li.grid__item';

  const root = document.documentElement;
  let count = 0;

  // ----------------------------------------------------------------- the mode
  function applyMode(mode) {
    const wanted = MODES[mode] || MODES[DEFAULT_MODE];
    for (const cls of Object.values(MODES)) {
      root.classList.toggle(cls, cls === wanted);
    }
    log('mode', mode);
  }

  // Read the stored mode as early as possible. Until it resolves no mode class
  // is set, so a card is never painted in the wrong state and then corrected.
  chrome.storage.sync.get({ mode: DEFAULT_MODE }, ({ mode }) => applyMode(mode));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.mode) applyMode(changes.mode.newValue);
  });

  // ---------------------------------------------------------------- the cards
  function tag(el) {
    const card = el.closest(CARD);
    if (!card || card.classList.contains(SOLD)) return;
    card.classList.add(SOLD);
    count++;
    markLabel(card);
  }

  // This store draws a "Sold out" badge on every sold-out card and then keeps
  // it at opacity 0 until the card is hovered — so a dimmed card in Peek would
  // otherwise be grey for no stated reason. Tagging the badge lets Peek show
  // the page's own label rather than adding a second one of ours. Only the
  // badge that actually says it: the same elements carry "NEW" and the sale
  // percentage, and those belong to the theme.
  function markLabel(card) {
    for (const badge of card.querySelectorAll('.badge')) {
      const text = badge.textContent.trim().toLowerCase();
      if (text === 'sold out' || text === 'out of stock') {
        badge.classList.add(LABEL);
        return;                      // the first one; the theme draws two
      }
    }
  }

  function scan() {
    // Primary: Dawn adds `price--sold-out` to the price block of a product with
    // no variant in stock. This is the reliable one.
    document.querySelectorAll('.price--sold-out').forEach(tag);

    // Secondary: the visible badge, for sections where the price block is
    // absent or custom. The text test matters — on this store `.badge` is worn
    // by the "New" flag and the sale-percentage chip too, and hiding those
    // cards would hide products that are perfectly available.
    document.querySelectorAll('.badge').forEach(el => {
      const text = el.textContent.trim().toLowerCase();
      if (text === 'sold out' || text === 'out of stock') tag(el);
    });

    log('sold-out cards tagged:', count);
  }

  function start() {
    scan();

    // The grid is rebuilt by slider navigation, collection filters and infinite
    // scroll. Debounced, because Dawn mutates in bursts.
    let timer = null;
    new MutationObserver(mutations => {
      if (!mutations.some(m => m.addedNodes.length > 0)) return;
      clearTimeout(timer);
      timer = setTimeout(scan, 250);
    }).observe(document.body, { childList: true, subtree: true });
  }

  // Runs at document_start, so document.body may not exist yet.
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });

  // ---------------------------------------------------------------- the popup
  // The popup asks the active tab what it found. Answering from here means the
  // number in the popup is the number on the page in front of you, and it needs
  // no permission beyond the host access this script already has.
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg && msg.type === 'mshs:count') {
      respond({ count, total: document.querySelectorAll(CARD).length });
    }
  });
})();
