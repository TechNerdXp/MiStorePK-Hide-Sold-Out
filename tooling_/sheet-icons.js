/**
 * Icon contact sheet — verification, not a shipped asset.
 *
 *   node tooling_/sheet-icons.js   →  tooling_/_verify/icons.png
 *
 * Every size at true scale and blown up, on the four grounds the icon actually
 * lands on: white (Web Store tile), #DEE1E6 (Chrome light toolbar), #35363A
 * (Chrome dark toolbar), and the product's own surface. Reading the PNG bytes
 * tells you the mark exists; only looking tells you it reads.
 */

const fs = require('fs');
const path = require('path');
const { launch } = require('./chrome');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, '_verify');

const GROUNDS = [
  ['Web Store · white', '#ffffff', '#14131b'],
  ['Chrome light · #DEE1E6', '#DEE1E6', '#14131b'],
  ['Chrome dark · #35363A', '#35363A', '#f2f0f7'],
  ['own surface · #15141C', '#15141C', '#f2f0f7']
];

const SIZES = [16, 32, 48, 128];

const row = (bg, fg, label) => `
  <section style="background:${bg};color:${fg}">
    <h2>${label}</h2>
    <div class="strip">
      ${SIZES.map(s => `
        <figure>
          <img src="../../icons/icon${s}.png" width="${s}" height="${s}" alt="">
          <figcaption>${s}px true</figcaption>
        </figure>`).join('')}
      ${SIZES.map(s => `
        <figure>
          <img src="../../icons/icon${s}.png" width="96" height="96"
               style="image-rendering:pixelated" alt="">
          <figcaption>${s}px @6x</figcaption>
        </figure>`).join('')}
    </div>
  </section>`;

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, sans-serif; }
  section { padding: 18px 24px; }
  h2 { font-size: 12px; font-weight: 400; letter-spacing: .08em;
       text-transform: uppercase; opacity: .65; margin: 0 0 14px; }
  .strip { display: flex; align-items: flex-end; gap: 22px; flex-wrap: wrap; }
  figure { margin: 0; text-align: center; }
  figcaption { font-size: 10px; opacity: .6; margin-top: 8px; }
</style>
${GROUNDS.map(g => row(g[1], g[2], g[0])).join('')}
`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const page = path.join(OUT, 'icons.html');
  fs.writeFileSync(page, html);

  const chrome = await launch({ width: 980, height: 1000 });
  try {
    await chrome.goto('file:///' + page.replace(/\\/g, '/'));
    await chrome.settleImages();
    const h = await chrome.evaluate('document.documentElement.scrollHeight');
    await chrome.send('Emulation.setDeviceMetricsOverride', {
      width: 980, height: h, deviceScaleFactor: 1, mobile: false
    });
    await chrome.screenshot(path.join(OUT, 'icons.png'));
    console.log('tooling_/_verify/icons.png');
  } finally {
    await chrome.close();
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
