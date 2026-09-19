/**
 * Hide Sold Out — Chrome Web Store promo graphics
 *
 *   node tooling_/gen-promo.js   →  store/assets/promo-small.png     440 x 280
 *                                   store/assets/promo-marquee.png  1400 x 560
 *
 * Requires MSHS_CHROME (a Chrome for Testing build) — see tooling_/chrome.js.
 *
 * ---------------------------------------------------------------------------
 * The marquee carries one real capture of mistore.pk with this extension
 * running in Peek, framed on a row where two available products sit beside two
 * sold-out ones. That single row is the entire product: what it keeps, what it
 * quiets, and the difference between them. Nothing is illustrated.
 *
 * What the old tiles did and these do not: a display weight Poppins does not
 * have, an orange gradient wash, decorative arcs and hatching, grey rectangles
 * with red crosses standing in for products, and "Developed by TechNerdXp"
 * printed twice on one banner. Light type, one accent, real pixels, and the
 * parent's wordmark once, in the corner.
 *
 * Chrome renders these rather than a rasteriser, because the type is set in the
 * bundled Poppins and resvg cannot read woff2 — it drops every glyph silently.
 * ---------------------------------------------------------------------------
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { launch, unpackedExtensionId, sleep } = require('./chrome');
const { ensureNoAlpha } = require('./png');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'store', 'assets');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'mshs-promo-'));

const COLLECTION = process.env.MSHS_PAGE || 'https://mistore.pk/collections/audio';

// The grid is captured at four columns (Dawn needs >= 990px for that) and then
// set into the marquee at 0.8, which is small enough to read as a picture of a
// page rather than as a page.
const GRID_W = 1000;
const GRID_H = 386;

const fileUrl = p => 'file:///' + p.replace(/\\/g, '/');

const FONTS = `
  @font-face { font-family:"Poppins"; font-weight:300; font-display:block;
               src:url("${fileUrl(path.join(ROOT, 'fonts', 'poppins-300-latin.woff2'))}") format("woff2"); }
  @font-face { font-family:"Poppins"; font-weight:500; font-display:block;
               src:url("${fileUrl(path.join(ROOT, 'fonts', 'poppins-500-latin.woff2'))}") format("woff2"); }`;

/* The signature, verbatim from ui.css: the wordmark alone, Silver, one Signal
   Green shard through the `h`, once per surface, never a button. */
const SIGNATURE = `
  .wordmark { font-size:13px; font-weight:300; letter-spacing:0.02em; color:#9c9186;
              text-decoration:none; white-space:nowrap; }
  .wm-cut { position:relative; }
  .wm-cut::after {
    content:""; position:absolute; top:50%; left:50%;
    width:0.13em; height:1.95em;
    transform:translate(-50%, -50%) rotate(13deg);
    clip-path:polygon(50% 0%, 100% 36%, 50% 100%, 0% 36%);
    background:linear-gradient(to bottom, #30c819 0%, #30c819 26%, #60e84a 40%, #30c819 60%, #30c819 100%);
  }`;

const WORDMARK = `<a class="wordmark" href="https://technerdxp.com">Tec<span class="wm-cut">h</span>NerdXp</a>`;

function marqueeHtml(gridPng) {
  return `<!doctype html><meta charset="utf-8"><style>${FONTS}${SIGNATURE}
  * { box-sizing:border-box; }
  html, body { margin:0; padding:0; }
  body { width:1400px; height:560px; overflow:hidden; background:#171310; color:#f2ede7;
         font-family:"Poppins", sans-serif; font-weight:300;
         -webkit-font-smoothing:antialiased; }
  .frame { position:relative; width:1400px; height:560px; }

  .copy { position:absolute; left:74px; top:152px; width:352px; }
  .mark { width:40px; height:40px; display:block; margin-bottom:26px; }
  h1 { margin:0; font-size:41px; font-weight:300; letter-spacing:-0.015em; line-height:1.08; }
  .lead { margin:18px 0 0; font-size:16px; line-height:1.55; letter-spacing:0.012em;
          color:rgb(242 237 231 / 0.7); }
  .host { margin:22px 0 0; font-size:11.5px; letter-spacing:0.14em; text-transform:uppercase;
          color:#ff6900; }

  /* The signature sits in the corner, once. */
  .sign { position:absolute; left:74px; bottom:54px; }

  /* The capture: a real page, held at a slight remove so it reads as the
     product in use rather than as the tile's background. */
  .shot { position:absolute; right:62px; top:125px; width:${Math.round(GRID_W * 0.8)}px;
          height:${Math.round(GRID_H * 0.8)}px; border-radius:10px; overflow:hidden;
          background:#fff; box-shadow:0 24px 70px -20px rgb(0 0 0 / 0.75); }
  .shot img { display:block; width:${GRID_W}px; transform:scale(0.8); transform-origin:0 0; }
  .shot::after { content:""; position:absolute; inset:0; border-radius:10px;
                 box-shadow:inset 0 0 0 1px rgb(255 255 255 / 0.08); }

  .caption { position:absolute; right:62px; top:${Math.round(GRID_H * 0.8) + 143}px;
             width:${Math.round(GRID_W * 0.8)}px; font-size:13px; letter-spacing:0.02em;
             color:rgb(242 237 231 / 0.5); text-align:right; }
</style>
<div class="frame">
  <div class="copy">
    <img class="mark" src="${fileUrl(path.join(ROOT, 'icons', 'icon128.png'))}" alt="">
    <h1>Hide Sold Out</h1>
    <p class="lead">Sold-out products leave the grid. Or switch to Peek and they stay
       where they are, dimmed and greyed, still one click away.</p>
    <p class="host">for mistore.pk</p>
  </div>
  <div class="sign">${WORDMARK}</div>
  <div class="shot"><img src="${fileUrl(gridPng)}" alt=""></div>
  <div class="caption">Peek, on a live collection page</div>
</div>`;
}

function smallHtml() {
  return `<!doctype html><meta charset="utf-8"><style>${FONTS}${SIGNATURE}
  * { box-sizing:border-box; }
  html, body { margin:0; padding:0; }
  body { width:440px; height:280px; overflow:hidden; background:#171310; color:#f2ede7;
         font-family:"Poppins", sans-serif; font-weight:300;
         -webkit-font-smoothing:antialiased; }
  .frame { position:relative; width:440px; height:280px; padding:34px 34px 0; }
  .mark { width:34px; height:34px; display:block; margin-bottom:20px; }
  h1 { margin:0; font-size:27px; font-weight:300; letter-spacing:-0.012em; line-height:1.1; }
  p { margin:11px 0 0; font-size:13px; line-height:1.5; letter-spacing:0.015em;
      color:rgb(242 237 231 / 0.68); max-width:330px; }
  .host { position:absolute; left:34px; bottom:30px; font-size:10.5px; letter-spacing:0.14em;
          text-transform:uppercase; color:#ff6900; }
  .sign { position:absolute; right:34px; bottom:27px; }
</style>
<div class="frame">
  <img class="mark" src="${fileUrl(path.join(ROOT, 'icons', 'icon128.png'))}" alt="">
  <h1>Hide Sold Out</h1>
  <p>Sold-out products, gone from the grid — or dimmed, if you would rather see them.</p>
  <span class="host">for mistore.pk</span>
  <span class="sign">${WORDMARK}</span>
</div>`;
}

(async () => {
  if (!process.env.MSHS_CHROME) {
    console.warn('  note: MSHS_CHROME is not set. Stable Chrome ignores --load-extension,\n' +
                 '        so the capture would show the site WITHOUT the extension.\n');
  }

  fs.mkdirSync(OUT, { recursive: true });
  const chrome = await launch({ width: GRID_W, height: GRID_H, loadExtension: ROOT });

  try {
    // ------------------------------------------------- the live page, in Peek
    const id = unpackedExtensionId(ROOT);
    const setter = await chrome.openTab(`chrome-extension://${id}/popup.html`, { width: 300, height: 320 });
    await setter.evaluate(`chrome.storage.sync.set({ mode: 'peek' })`);
    await chrome.activate();
    await sleep(500);

    await chrome.goto(COLLECTION, { settle: 2600 });
    await chrome.settleImages(20000);
    await sleep(1000);

    const tagged = await chrome.evaluate(`document.querySelectorAll('li.grid__item.mshs-sold').length`);
    if (!tagged) throw new Error('no sold-out cards tagged — is the extension loaded? (MSHS_CHROME)');

    // Frame on a sold-out card, so the row that lands in the tile has both
    // kinds of product in it. That contrast is the whole message.
    await chrome.hideSiteWidgets();
    // Just above the card's own top edge: enough air to breathe, not so much
    // that the previous row's cut-off prices ride along into the tile.
    await chrome.scrollToGrid('li.grid__item.mshs-sold', 16);
    const gridPng = path.join(WORK, 'grid-peek.png');
    await chrome.screenshot(gridPng);
    console.log(`  captured the grid in Peek (${tagged} sold-out cards)`);

    await setter.close();

    // ------------------------------------------------------------- the tiles
    const stage = await chrome.openTab(null, { width: 1400, height: 560 });
    await stage.activate();

    const jobs = [
      ['promo-marquee.png', marqueeHtml(gridPng), 1400, 560],
      ['promo-small.png', smallHtml(), 440, 280]
    ];

    for (const [name, html, w, h] of jobs) {
      const page = path.join(WORK, name.replace('.png', '.html'));
      fs.writeFileSync(page, html);
      await stage.resize(w, h);
      await stage.goto(fileUrl(page), { settle: 500 });
      await stage.requireFont('Poppins');
      await stage.settleImages(20000);

      const out = path.join(OUT, name);
      await stage.screenshot(out, { x: 0, y: 0, width: w, height: h });
      const res = ensureNoAlpha(out);
      console.log(`  ${name}  ${w}x${h}  ${res.converted ? 'flattened to 24-bit' : 'already 24-bit'}`);
    }
  } finally {
    await chrome.quit();
    try { fs.rmSync(WORK, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nstore/assets/promo-*.png\n');
})().catch(e => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
