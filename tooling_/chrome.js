/**
 * Headless Chrome, driven over the DevTools protocol on a pipe.
 *
 * Every decision in here was forced by something that failed silently:
 *
 *   --screenshot IS NOT USABLE. Chrome's one-shot screenshot flag dies on a
 *   heavy live page ("Abnormal renderer termination") and hangs forever — no
 *   error, no timeout — when combined with --load-extension. Everything here
 *   goes through Page.captureScreenshot instead.
 *
 *   --load-extension ALONE DOES NOTHING on Chrome 137+. The flag was abused by
 *   malware and is now ignored unless it is accompanied by BOTH
 *   --enable-unsafe-extension-debugging and --remote-debugging-pipe. There is
 *   no error: the browser starts, the extension is simply not there, the
 *   content script never runs, and every count comes back zero. Because the
 *   pipe is mandatory, this file speaks CDP over file descriptors 3 and 4
 *   rather than over a WebSocket, and there is no http://127.0.0.1:PORT/json
 *   endpoint to fall back on.
 *
 *   --user-data-dir IS ALWAYS PASSED, into a fresh temp directory. Without it
 *   Chrome attaches to the user's own running browser, finds the profile
 *   locked, and waits for a lock that is never coming.
 *
 *   FONTS ARE MEASURED, NOT ASKED ABOUT. document.fonts.check() returns true
 *   for a family that does not exist, because the fallback "can render" the
 *   text — it will happily tell you Poppins is fine on a blank error page.
 *   requireFont() looks for a loaded FontFace of that family instead.
 *
 *   HEADLESS REPORTS prefers-color-scheme: light regardless of the OS. Pages
 *   that want the dark tokens must re-assert them, or ask for the override
 *   through Emulation.setEmulatedMedia — see setColorScheme() below.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Stable Google Chrome refuses --load-extension outright ("not allowed in
 * Google Chrome, ignoring") from 137 on, so anything that needs the extension
 * actually loaded needs a Chrome for Testing build:
 *
 *   npx @puppeteer/browsers install chrome@stable
 *   set MSHS_CHROME=<the chrome.exe it prints>
 *
 * Plain page rendering works in either, so MSHS_CHROME is only required by the
 * scripts that load the extension.
 */
function findChrome() {
  if (process.env.MSHS_CHROME && fs.existsSync(process.env.MSHS_CHROME)) return process.env.MSHS_CHROME;
  if (process.argv[2] && /chrome|edge/i.test(process.argv[2])) return process.argv[2];
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('Chrome not found. Pass its path: node tooling_/<script>.js "C:\\...\\chrome.exe"');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * The ID Chrome gives an unpacked extension is the first 16 bytes of the
 * SHA-256 of its absolute path, each nibble mapped onto a–p. On Windows the
 * path is hashed as UTF-16LE, which is why this is not simply the utf8 digest.
 */
function unpackedExtensionId(absPath) {
  const crypto = require('crypto');
  const enc = process.platform === 'win32' ? 'utf16le' : 'utf8';
  const hash = crypto.createHash('sha256').update(absPath, enc).digest();
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(97 + (hash[i] >> 4));
    id += String.fromCharCode(97 + (hash[i] & 0xf));
  }
  return id;
}

async function launch(opts = {}) {
  const { width = 1280, height = 800, loadExtension = null } = opts;

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mshs-chrome-'));

  // An unpacked extension is only loaded into a profile that has developer mode
  // switched on. A fresh temp profile does not, and Chrome says nothing about
  // it: the browser starts, --load-extension is accepted and listed in
  // chrome://version, and chrome://extensions is empty. Seeding the preference
  // before first launch is the difference between the content script running
  // and every count silently coming back zero.
  if (loadExtension) {
    const defaultDir = path.join(profile, 'Default');
    fs.mkdirSync(defaultDir, { recursive: true });
    fs.writeFileSync(
      path.join(defaultDir, 'Preferences'),
      JSON.stringify({ extensions: { ui: { developer_mode: true } } })
    );
  }

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,OptimizationHints,MediaRouter',
    '--allow-file-access-from-files',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--remote-debugging-pipe',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`
  ];
  if (loadExtension) {
    args.push(
      '--enable-unsafe-extension-debugging',
      `--load-extension=${loadExtension}`,
      `--disable-extensions-except=${loadExtension}`
    );
  }
  args.push('about:blank');

  // fd 3 = we write to the browser, fd 4 = the browser writes to us.
  const child = spawn(findChrome(), args, {
    stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe']
  });

  const writePipe = child.stdio[3];
  const readPipe = child.stdio[4];

  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  let buffer = Buffer.alloc(0);

  readPipe.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    let end;
    while ((end = buffer.indexOf(0)) !== -1) {
      const raw = buffer.subarray(0, end).toString('utf8');
      buffer = buffer.subarray(end + 1);
      let msg;
      try { msg = JSON.parse(raw); } catch (e) { continue; }
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else {
        for (const fn of listeners) fn(msg);
      }
    }
  });

  function rawSend(method, params = {}, sessionId = undefined, timeout = 0) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      const payload = JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params });
      writePipe.write(payload + '\0');
      // A command sent before the browser is listening is never answered and
      // never refused — without a deadline the await below simply parks, which
      // is indistinguishable from Chrome hanging.
      if (timeout) {
        setTimeout(() => {
          if (pending.has(id)) { pending.delete(id); reject(new Error(`${method} timed out`)); }
        }, timeout);
      }
    });
  }

  // Wait for the browser to answer at all.
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    try { await rawSend('Browser.getVersion', {}, undefined, 1000); ready = true; }
    catch (e) { await sleep(250); }
  }
  if (!ready) { child.kill(); throw new Error('Chrome never answered on the DevTools pipe'); }

  /** Attach to one target id and return a driver bound to its session. */
  async function attach(targetId) {
    const { sessionId } = await rawSend('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => rawSend(method, params, sessionId);

    const consoleLog = [];
    listeners.add(msg => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.consoleAPICalled') {
        consoleLog.push({
          type: msg.params.type,
          text: (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ')
        });
      }
    });

    await send('Page.enable', {});
    await send('Runtime.enable', {});
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false
    });

    const api = {
      send, consoleLog, targetId, sessionId,

      async evaluate(expression) {
        const r = await send('Runtime.evaluate', {
          expression, returnByValue: true, awaitPromise: true
        });
        if (r.exceptionDetails) {
          throw new Error('page threw: ' +
            (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
        }
        return r.result.value;
      },

      async goto(url, { settle = 1200 } = {}) {
        await send('Page.navigate', { url });
        for (let i = 0; i < 60; i++) {
          const state = await api.evaluate('document.readyState').catch(() => null);
          if (state === 'complete') break;
          await sleep(400);
        }
        await sleep(settle);
      },

      /**
       * Make this tab the active one. Matters more than it looks: the popup
       * asks chrome.tabs.query for the ACTIVE tab, so a harness that leaves its
       * own popup tab in front gets told about the popup.
       */
      async activate() {
        await rawSend('Target.activateTarget', { targetId });
      },

      async reload() {
        await send('Page.reload', {});
        for (let i = 0; i < 60; i++) {
          const state = await api.evaluate('document.readyState').catch(() => null);
          if (state === 'complete') break;
          await sleep(300);
        }
      },

      async resize(w, h) {
        await send('Emulation.setDeviceMetricsOverride', {
          width: w, height: h, deviceScaleFactor: 1, mobile: false
        });
      },

      /** Headless always says light; this is how a page gets asked for dark. */
      async setColorScheme(scheme) {
        await send('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: scheme }]
        });
      },

      /**
       * Put the product grid under the viewport and let its lazy images in.
       * A collection page opens on a banner; the grid — which is the only part
       * this extension touches — starts a screen and a half down.
       */
      async scrollToGrid(selector = 'li.grid__item', offset = 90) {
        const found = await api.evaluate(`
          (() => {
            const el = document.querySelector('${selector}');
            if (!el) return false;
            const y = el.getBoundingClientRect().top + window.scrollY - ${offset};
            window.scrollTo(0, Math.max(0, y));
            return true;
          })()
        `);
        if (!found) return false;
        await sleep(900);
        // Lazy images only begin loading once they are near the viewport, so
        // this wait has to come after the scroll and has to include them.
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          const left = await api.evaluate(`
            [...document.images].filter(i => {
              const r = i.getBoundingClientRect();
              const near = r.bottom > -200 && r.top < innerHeight + 200;
              return near && !i.complete;
            }).length
          `).catch(() => 0);
          if (left === 0) break;
          await sleep(400);
        }
        await sleep(500);
        return true;
      },

      /**
       * Take the store's own third-party furniture out of a capture: the live
       * chat bubble, cookie bars, newsletter modals. None of it belongs to this
       * extension and all of it floats over the grid, which is the one thing
       * these pictures are of. Nothing that belongs to the page's content is
       * touched.
       */
      async hideSiteWidgets() {
        await api.evaluate(`
          (() => {
            const css = \`
              iframe[title*="Help" i], iframe[title*="chat" i], iframe[id*="chat" i],
              #launcher, .gorgias-chat-container, [class*="chat-button" i],
              [id*="cookie" i][class*="banner" i], .needsclick[id*="klaviyo" i],
              [id*="avada" i], [class*="avada" i], [class*="joy-" i],
              [id*="loyalty" i], [class*="loyalty" i],
              [id*="rewards" i], [class*="rewards" i],
              [id*="smile-ui" i], [class*="back-to-top" i] {
                display: none !important;
              }\`;
            let tag = document.getElementById('mshs-capture-style');
            if (!tag) {
              tag = document.createElement('style');
              tag.id = 'mshs-capture-style';
              document.documentElement.appendChild(tag);
            }
            tag.textContent = css;
            return true;
          })()
        `).catch(() => false);
        await sleep(250);
      },

      async settleImages(timeout = 15000) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          const left = await api.evaluate(
            `[...document.images].filter(i => i.loading !== 'lazy' && !i.complete).length`
          ).catch(() => 0);
          if (left === 0) return true;
          await sleep(400);
        }
        return false;
      },

      /**
       * Fail the run if the bundled face is not actually loaded. Not
       * document.fonts.check() — that returns true for a family that does not
       * exist at all, which is exactly the case this is guarding against.
       */
      async requireFont(family = 'Poppins', weights = [300, 500]) {
        // A face is only fetched when something on the page actually sets text
        // in it, so a surface that uses 300 and not 500 would report 500
        // missing even though the file is perfectly good. Ask for each weight
        // explicitly first: what is being tested is that the file resolves and
        // parses, not that this particular page happens to use it.
        for (const w of weights) {
          await api.evaluate(`document.fonts.load('${w} 16px "${family}"')`).catch(() => {});
        }
        await api.evaluate('document.fonts.ready');
        const loaded = await api.evaluate(
          `JSON.stringify([...document.fonts]
             .filter(f => f.family.replace(/["']/g, '') === '${family}' && f.status === 'loaded')
             .map(f => f.weight))`
        );
        const have = JSON.parse(loaded).map(String);
        const missing = weights.map(String).filter(w => !have.includes(w));
        if (missing.length) {
          throw new Error(
            `${family} ${missing.join(' and ')} did not load (loaded: ${have.join(', ') || 'none'}). ` +
            'The page would render in a fallback face.'
          );
        }
        return have;
      },

      async screenshot(file, clip = null) {
        const params = { format: 'png', captureBeyondViewport: false };
        if (clip) params.clip = { ...clip, scale: 1 };
        const { data } = await send('Page.captureScreenshot', params);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(data, 'base64'));
        return file;
      },

      async openTab(url, size = {}) {
        const { targetId: id } = await rawSend('Target.createTarget', { url: 'about:blank' });
        const tab = await attach(id);
        if (size.width) await tab.resize(size.width, size.height || height);
        if (url) await tab.goto(url);
        return tab;
      },

      async close() {
        try { await rawSend('Target.closeTarget', { targetId }); } catch (e) {}
      },

      async quit() {
        try { child.kill(); } catch (e) {}
        await sleep(400);
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
      }
    };

    return api;
  }

  // The about:blank page Chrome opened for us.
  let pageTarget = null;
  for (let i = 0; i < 40 && !pageTarget; i++) {
    const { targetInfos } = await rawSend('Target.getTargets');
    pageTarget = targetInfos.find(t => t.type === 'page');
    if (!pageTarget) await sleep(250);
  }
  if (!pageTarget) { child.kill(); throw new Error('Chrome never opened a page target'); }

  return attach(pageTarget.targetId);
}

module.exports = { launch, findChrome, sleep, unpackedExtensionId };
