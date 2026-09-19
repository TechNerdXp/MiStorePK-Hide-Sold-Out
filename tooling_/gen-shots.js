/**
 * Hide Sold Out — Chrome Web Store screenshots
 *
 *   node tooling_/gen-shots.js   →  store/assets/screenshot-*.png  (1280 x 800)
 *
 * Requires MSHS_CHROME (a Chrome for Testing build) — see tooling_/chrome.js.
 *
 * ---------------------------------------------------------------------------
 * THESE ARE PHOTOGRAPHS, NOT DRAWINGS.
 *
 * Every pixel of grid in these four frames is mistore.pk, loaded live, with
 * this extension actually installed and running. The old screenshot was a
 * drawing: grey rectangles standing in for products, a red cross over each one,
 * a fake "mistore.pk" wordmark, and a callout arrow pointing at a card that did
 * not exist. The Web Store asks that screenshots demonstrate real
 * functionality, and this is the only way to be sure they do — when the product
 * changes, re-running this changes the pictures with it.
 *
 * The browser bar is drawn rather than captured, because the toolbar button is
 * where the toggle lives and a bare crop of the page loses it. Everything below
 * the bar is real.
 *
 * The four frames:
 *   1  Hide   — the grid with sold-out products gone
 *   2  Peek   — the same grid, same scroll position, dimmed instead
 *   3  Popup  — the real popup hanging off the toolbar button, over the page
 *   4  Home   — the homepage sliders, to show it is not just collection pages
 * ---------------------------------------------------------------------------
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { launch, unpackedExtensionId, sleep } = require('./chrome');
const { ensureNoAlpha } = require('./png');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'store', 'assets');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'mshs-shots-'));

const W = 1280;
const H = 800;
const CAPTION = 108;          // the band that says what you are looking at
const BAR = 46;               // the drawn browser bar
const STAGE = H - CAPTION - BAR;

const COLLECTION = process.env.MSHS_PAGE || 'https://mistore.pk/collections/audio';
const HOME = 'https://mistore.pk/';

const FRAMES = [
  {
    file: 'screenshot-1-hide.png',
    title: 'Sold-out products, gone',
    sub: 'The grid closes up behind them. Nothing to scroll past, nothing to click into and discover.',
    shot: 'hide'
  },
  {
    file: 'screenshot-2-peek.png',
    title: 'Or keep them, quietly',
    sub: 'Peek leaves sold-out products in place — dimmed, greyed, still one click away.',
    shot: 'peek'
  },
  {
    file: 'screenshot-3-popup.png',
    title: 'One toggle, in the toolbar',
    sub: 'Switch between Hide and Peek. Every open mistore.pk tab changes at once, with no reload.',
    shot: 'popup'
  },
  {
    file: 'screenshot-4-home.png',
    title: 'Every grid on the site',
    sub: 'Collection pages, search results and the sliders on the homepage — including what they load as you scroll.',
    shot: 'home'
  }
];

// ---------------------------------------------------------------- the stage
// Dark tokens are written out literally rather than taken from ui.css by media
// query: headless reports prefers-color-scheme: light whatever the OS says, so
// a stage that asked for dark would quietly come back light.
const css = `
  @font-face { font-family:"Poppins"; font-weight:300; font-display:block;
               src:url("${fileUrl(path.join(ROOT, 'fonts', 'poppins-300-latin.woff2'))}") format("woff2"); }
  @font-face { font-family:"Poppins"; font-weight:500; font-display:block;
               src:url("${fileUrl(path.join(ROOT, 'fonts', 'poppins-500-latin.woff2'))}") format("woff2"); }

  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body {
    width:${W}px; height:${H}px; overflow:hidden;
    background:#171310; color:#f2ede7;
    font-family:"Poppins", sans-serif; font-weight:300;
    -webkit-font-smoothing: antialiased;
  }

  /* A screenshot stage must be position:relative with absolutely positioned
     children — fixed positioning escapes the capture and lands wherever the
     scroll happens to be. */
  .frame { position:relative; width:${W}px; height:${H}px; }

  .caption { position:absolute; top:0; left:0; right:0; height:${CAPTION}px;
             padding:24px 56px 0; }
  .caption h1 { margin:0; font-size:27px; font-weight:300; letter-spacing:-0.01em;
                line-height:1.2; }
  .caption p  { margin:7px 0 0; font-size:14px; font-weight:300; letter-spacing:0.012em;
                color:rgb(242 237 231 / 0.66); max-width:1000px; }

  /* The one accent, as a hairline under the caption. */
  .rule { position:absolute; top:${CAPTION - 1}px; left:0; right:0; height:1px;
          background:linear-gradient(to right, #ff6900 0 190px, #2f271f 190px 100%); }

  .browser { position:absolute; top:${CAPTION}px; left:0; right:0; height:${BAR}px;
             background:#211b16; display:flex; align-items:center; gap:9px;
             padding:0 16px; border-bottom:1px solid #2f271f; }
  .dot { width:10px; height:10px; border-radius:50%; background:#3d332a; flex:none; }
  .url { flex:1; height:26px; border-radius:13px; background:#171310; margin-left:8px;
         display:flex; align-items:center; padding:0 12px; font-size:11.5px;
         letter-spacing:0.02em; color:rgb(242 237 231 / 0.5); }
  .tool { width:26px; height:26px; border-radius:6px; display:flex; align-items:center;
          justify-content:center; flex:none; }
  .tool img { width:17px; height:17px; display:block; }
  .tool.on { background:rgb(255 105 0 / 0.16); outline:1px solid rgb(255 105 0 / 0.5); }

  .page { position:absolute; top:${CAPTION + BAR}px; left:0; width:${W}px;
          height:${STAGE}px; overflow:hidden; background:#fff; }
  .page img { display:block; width:${W}px; }

  /* The popup, where it actually hangs: under the toolbar button, at the right. */
  .popup { position:absolute; top:${CAPTION + BAR + 8}px; right:14px;
           border-radius:10px; overflow:hidden;
           box-shadow:0 10px 40px -8px rgb(0 0 0 / 0.55), 0 2px 6px rgb(0 0 0 / 0.3); }
  .popup img { display:block; }
`;

function fileUrl(p) { return 'file:///' + p.replace(/\\/g, '/'); }

function frameHtml(frame, pagePng, popupPng) {
  return `<!doctype html><meta charset="utf-8"><style>${css}</style>
<div class="frame">
  <div class="caption">
    <h1>${frame.title}</h1>
    <p>${frame.sub}</p>
  </div>
  <div class="rule"></div>
  <div class="browser">
    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    <span class="url">mistore.pk</span>
    <span class="tool${frame.shot === 'popup' ? ' on' : ''}">
      <img src="${fileUrl(path.join(ROOT, 'icons', 'icon32.png'))}" alt="">
    </span>
  </div>
  <div class="page"><img src="${fileUrl(pagePng)}" alt=""></div>
  ${frame.shot === 'popup' ? `<div class="popup"><img src="${fileUrl(popupPng)}" alt=""></div>` : ''}
</div>`;
}

// --------------------------------------------------------------------- run
(async () => {
  if (!process.env.MSHS_CHROME) {
    console.warn('  note: MSHS_CHROME is not set. Stable Chrome ignores --load-extension,\n' +
                 '        so the captures would show the site WITHOUT the extension.\n');
  }

  fs.mkdirSync(OUT, { recursive: true });
  const chrome = await launch({ width: W, height: STAGE, loadExtension: ROOT });

  try {
    // ---------------------------------------------------- the live page, twice
    const captures = {};

    async function capture(name, url, mode, selector, offset) {
      await chrome.goto(url, { settle: 2600 });
      await chrome.settleImages(20000);
      await sleep(1000);
      await chrome.evaluate(`chrome.storage ? 0 : 0`).catch(() => {});
      await chrome.hideSiteWidgets();
      await chrome.scrollToGrid('li.grid__item');

      // The mode is set through storage from the popup, exactly as a person
      // sets it; the content script's listener does the rest with no reload.
      await setMode(mode);
      await sleep(900);
      // Framed only after the mode is applied, because the mode changes the
      // layout: in Peek the point is the dimmed row, so the capture is framed
      // on a card that Hide would have removed entirely.
      await chrome.scrollToGrid(selector || 'li.grid__item', offset || 90);

      const tagged = await chrome.evaluate(`document.querySelectorAll('li.grid__item.mshs-sold').length`);
      if (!tagged) throw new Error(`${url} tagged no sold-out cards — is the extension loaded?`);

      const file = path.join(WORK, name + '.png');
      await chrome.screenshot(file);
      captures[name] = file;
      console.log(`  captured ${name}  (${tagged} sold-out cards, mode ${mode})`);
    }

    const id = unpackedExtensionId(ROOT);
    const setter = await chrome.openTab(`chrome-extension://${id}/popup.html`, { width: 300, height: 320 });
    async function setMode(mode) {
      await setter.evaluate(`chrome.storage.sync.set({ mode: '${mode}' })`);
      await chrome.activate();
      await sleep(400);
    }

    await capture('hide', COLLECTION, 'hide');
    await capture('peek', COLLECTION, 'peek', 'li.grid__item.mshs-sold', 230);
    await capture('home', HOME, 'hide');
    await capture('popup-page', COLLECTION, 'hide');

    // ------------------------------------------------------------- the popup
    await setMode('hide');
    await setter.goto(`chrome-extension://${id}/popup.html`, { settle: 500 });
    await setter.reload();
    await sleep(700);
    await setter.requireFont('Poppins');
    const box = JSON.parse(await setter.evaluate(`
      (() => { const r = document.querySelector('.pop').getBoundingClientRect();
               return JSON.stringify({x:r.x, y:r.y, width:r.width, height:r.height}); })()
    `));
    await setter.activate();
    const popupPng = path.join(WORK, 'popup.png');
    await setter.screenshot(popupPng, box);
    await setter.close();
    console.log('  captured popup');

    // ------------------------------------------------------------ compositing
    const stage = await chrome.openTab(null, { width: W, height: H });
    await stage.activate();

    for (const frame of FRAMES) {
      const pagePng = captures[frame.shot === 'popup' ? 'popup-page' : frame.shot];
      const html = path.join(WORK, frame.file.replace('.png', '.html'));
      fs.writeFileSync(html, frameHtml(frame, pagePng, popupPng));

      await stage.goto(fileUrl(html), { settle: 500 });
      await stage.requireFont('Poppins');       // fails the run rather than shipping Arial
      await stage.settleImages(20000);

      const out = path.join(OUT, frame.file);
      await stage.screenshot(out, { x: 0, y: 0, width: W, height: H });

      // The Web Store rejects screenshots with an alpha channel, and the
      // rejection notice never says the word "alpha".
      const res = ensureNoAlpha(out);
      console.log(`  ${frame.file}  ${W}x${H}  ${res.converted ? 'flattened to 24-bit' : 'already 24-bit'}`);
    }
  } finally {
    await chrome.quit();
    try { fs.rmSync(WORK, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nstore/assets/screenshot-*.png\n');
})().catch(e => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
