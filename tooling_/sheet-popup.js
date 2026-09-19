/**
 * Popup contact sheet — verification, not a shipped asset.
 *
 *   node tooling_/sheet-popup.js   →  tooling_/_verify/popup.png
 *
 * The real popup, out of the real extension, reporting a real count from a real
 * mistore.pk tab: four states across the two themes — Hide and Peek, dark and
 * light. Headless always reports prefers-color-scheme: light, so the dark pair
 * is taken with the media feature emulated rather than hoped for.
 *
 * This is where a surface gets caught overrunning its frame or losing its
 * footer, which reading the CSS does not tell you.
 */

const fs = require('fs');
const path = require('path');
const { launch, unpackedExtensionId, sleep } = require('./chrome');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, '_verify');
const PAGE = process.env.MSHS_PAGE || 'https://mistore.pk/collections/audio';

(async () => {
  const chrome = await launch({ width: 1280, height: 800, loadExtension: ROOT });
  const shots = [];

  try {
    await chrome.goto(PAGE, { settle: 2500 });
    await chrome.settleImages(15000);
    await chrome.activate();

    const id = unpackedExtensionId(ROOT);
    const popup = await chrome.openTab(null, { width: 360, height: 420 });

    for (const scheme of ['dark', 'light']) {
      await popup.setColorScheme(scheme);
      for (const mode of ['hide', 'peek']) {
        // Set the mode the way the product does — through storage — then
        // reload so the popup paints from what it reads, not from a click.
        await popup.goto(`chrome-extension://${id}/popup.html`, { settle: 400 });
        await popup.evaluate(`chrome.storage.sync.set({ mode: '${mode}' })`);
        await chrome.activate();
        await popup.reload();
        await sleep(700);
        await popup.requireFont('Poppins');

        const box = JSON.parse(await popup.evaluate(`
          (() => { const r = document.querySelector('.pop').getBoundingClientRect();
                   return JSON.stringify({x:r.x, y:r.y, width:r.width, height:r.height}); })()
        `));
        const file = path.join(OUT, `popup-${scheme}-${mode}.png`);
        await popup.activate();
        await popup.screenshot(file, box);
        shots.push([`${scheme} · ${mode}`, file, box]);
        console.log(`  ${path.basename(file)}  ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }

    // One sheet, so the four can be compared in a single glance.
    const sheet = path.join(OUT, 'popup.html');
    fs.writeFileSync(sheet, `<!doctype html><meta charset="utf-8">
<style>
  body { margin:0; background:#8a8a8a; font-family: system-ui, sans-serif; }
  .row { display:flex; gap:20px; padding:20px; align-items:flex-start; }
  figure { margin:0; }
  img { display:block; box-shadow: 0 6px 20px rgb(0 0 0 / .35); border-radius: 6px; }
  figcaption { font-size:11px; color:#fff; letter-spacing:.06em; text-transform:uppercase; margin-top:8px; }
</style>
<div class="row">
${shots.map(([label, file]) =>
  `  <figure><img src="${path.basename(file)}"><figcaption>${label}</figcaption></figure>`).join('\n')}
</div>`);

    const viewer = await chrome.openTab('file:///' + sheet.replace(/\\/g, '/'), { width: 1360, height: 480 });
    await viewer.settleImages();
    const h = await viewer.evaluate('document.documentElement.scrollHeight');
    await viewer.resize(1360, h);
    await viewer.activate();
    await viewer.screenshot(path.join(OUT, 'popup.png'));
    console.log('\ntooling_/_verify/popup.png');
  } finally {
    await chrome.quit();
  }
})().catch(e => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
