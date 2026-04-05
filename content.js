// MiStorePK Hide Sold Out — content.js
// Targets mestore.pk (Shopify Dawn theme, t/155)
(function () {
  'use strict';

  window.__mistoreDebug = true; // confirms script loaded

  const hidden = new Set();

  function hideCard(li) {
    if (!li || hidden.has(li)) return;
    li.style.setProperty('display', 'none', 'important');
    hidden.add(li);
    console.log('[MiStore] hid card:', li.id || li.className.slice(0, 60));
  }

  function scan() {
    const byPrice  = document.querySelectorAll('.price--sold-out');
    const byBadge  = document.querySelectorAll('.badge');
    const allCards = document.querySelectorAll('li.grid__item');

    console.log(`[MiStore] scan — li.grid__item found: ${allCards.length} | .price--sold-out found: ${byPrice.length} | .badge found: ${byBadge.length}`);

    byPrice.forEach(el => hideCard(el.closest('li.grid__item')));

    byBadge.forEach(el => {
      const t = el.textContent.trim().toLowerCase();
      if (t === 'sold out' || t === 'out of stock') {
        hideCard(el.closest('li.grid__item'));
      }
    });
  }

  scan();

  let timer = null;
  new MutationObserver(mutations => {
    const relevant = mutations.some(m => m.addedNodes.length > 0);
    if (!relevant) return;
    clearTimeout(timer);
    timer = setTimeout(scan, 250);
  }).observe(document.body, { childList: true, subtree: true });
})();
