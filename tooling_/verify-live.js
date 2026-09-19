/**
 * End-to-end check against the live store — verification, not a shipped asset.
 *
 *   node tooling_/verify-live.js   →  tooling_/_verify/live-{hide,peek}.png
 *
 * Loads the real unpacked extension into headless Chrome, opens a real
 * mistore.pk collection page, and then drives the real popup in a second tab.
 * That second tab is the point: the popup is the only surface that can write to
 * chrome.storage, so clicking Peek there and watching the FIRST tab change —
 * with no reload, no re-navigation — is the only honest test of the toggle.
 *
 * What it asserts, and fails the run over:
 *   - sold-out cards are tagged, and the tag lands on the <li>, not the price
 *   - Hide actually removes them from layout
 *   - Peek keeps them in layout, dimmed, and still clickable
 *   - the mode flips live in an already-open tab
 *   - the content script says nothing to the console on someone else's site
 */

const path = require('path');
const { launch, unpackedExtensionId, sleep } = require('./chrome');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, '_verify');

// A collection with a healthy mix of in-stock and sold-out, so both states show
// something. /collections/all is ~14 sold out of 16, which proves the feature
// but makes a miserable picture.
const PAGE = process.env.MSHS_PAGE || 'https://mistore.pk/collections/audio';

const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); else console.log('  ok  ' + msg); };

(async () => {
  const chrome = await launch({ width: 1280, height: 800, loadExtension: ROOT });

  try {
    // ------------------------------------------------------------ the store tab
    await chrome.goto(PAGE, { settle: 2500 });
    await chrome.settleImages(20000);
    await sleep(1200);                           // let the observer's debounce land
    await chrome.scrollToGrid();                 // the grid, not the collection banner

    const state = () => chrome.evaluate(`JSON.stringify({
      mode: document.documentElement.className.match(/mshs-mode-\\w+/)?.[0] || null,
      tagged: document.querySelectorAll('li.grid__item.mshs-sold').length,
      taggedNotLi: document.querySelectorAll('.mshs-sold:not(li.grid__item)').length,
      cards: document.querySelectorAll('li.grid__item').length,
      visibleSold: [...document.querySelectorAll('li.grid__item.mshs-sold')]
        .filter(el => el.getClientRects().length > 0).length,
      opacity: (() => {
        const el = document.querySelector('li.grid__item.mshs-sold');
        return el ? getComputedStyle(el).opacity : null;
      })(),
      pointer: (() => {
        const el = document.querySelector('li.grid__item.mshs-sold');
        return el ? getComputedStyle(el).pointerEvents : null;
      })()
    })`).then(JSON.parse);

    const hide = await state();
    console.log('\nHIDE:', JSON.stringify(hide));
    check(hide.mode === 'mshs-mode-hide', 'default mode is Hide');
    check(hide.tagged > 0, `sold-out cards tagged (${hide.tagged} of ${hide.cards})`);
    check(hide.taggedNotLi === 0, 'the tag only ever lands on li.grid__item');
    check(hide.visibleSold === 0, 'Hide removes every tagged card from layout');
    await chrome.screenshot(path.join(OUT, 'live-hide.png'));

    // ------------------------------------------------------------- the popup tab
    const id = unpackedExtensionId(ROOT);
    const popup = await chrome.openTab(`chrome-extension://${id}/popup.html`, { width: 300, height: 320 });
    const title = await popup.evaluate('document.title');
    check(title === 'Hide Sold Out', `popup reachable at chrome-extension://${id}/`);

    await popup.requireFont('Poppins');
    check(true, 'popup renders in bundled Poppins, not a fallback face');

    // The popup reports on the ACTIVE tab. In a browser that is the page you
    // were looking at when you clicked the toolbar button; in this harness the
    // popup opened as a tab of its own and is sitting in front. Put the store
    // back in front and reload the popup, so what is measured is the path a
    // person actually takes.
    await chrome.activate();
    await popup.reload();
    await sleep(600);

    const countShown = await popup.evaluate(`document.getElementById('count').textContent`);
    const contextShown = await popup.evaluate(`document.getElementById('context').textContent`);
    check(countShown === String(hide.tagged),
      `popup count (${countShown}) matches the page (${hide.tagged})`);
    check(/of \d+ on this page/.test(contextShown),
      `popup names the page total ("${contextShown.trim()}")`);

    // The toggle, clicked for real.
    await popup.evaluate(`document.getElementById('mode-peek').click()`);
    await sleep(900);

    // ---------------------------------------- back to the tab that never reloaded
    const peek = await state();
    console.log('PEEK:', JSON.stringify(peek));
    check(peek.mode === 'mshs-mode-peek', 'the open store tab flipped to Peek with no reload');
    check(peek.visibleSold === peek.tagged, 'Peek keeps every sold-out card in layout');
    check(peek.opacity === '0.38', `Peek dims to 0.38 (got ${peek.opacity})`);
    check(peek.pointer !== 'none', 'Peek leaves sold-out cards clickable');
    await chrome.screenshot(path.join(OUT, 'live-peek.png'));

    // -------------------------------------------------------------- the console
    const noise = chrome.consoleLog.filter(m => /hide-sold-out|mistore\]/i.test(m.text));
    check(noise.length === 0, `content script is silent (${noise.length} of its own messages)`);

    await popup.close();
  } finally {
    await chrome.quit();
  }

  if (problems.length) {
    console.error('\nFAILED:\n' + problems.map(p => '  - ' + p).join('\n'));
    process.exit(1);
  }
  console.log('\nall checks passed — tooling_/_verify/live-{hide,peek}.png\n');
})().catch(e => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
