/**
 * Hide Sold Out — Chrome Web Store package
 *
 *   node tooling_/build.js   →  dist/mistorepk-hide-sold-out-<version>.zip
 *
 * The repo root IS the extension, so the package is built from an explicit
 * allowlist rather than by excluding things. An exclude list quietly ships
 * whatever gets added next; this one can only ship what is named below, and
 * fails if a named file has gone missing.
 *
 * What that keeps out, deliberately: tooling_/, store/, dist/, the promo art,
 * icons/mark.svg (a generator intermediate), pillars_off_creation/, README.md
 * and .git.
 *
 * Checks run before the zip is written, because a package that would be
 * rejected in review should never reach the dashboard.
 */

const fs = require('fs');
const path = require('path');
const { zipDirectory } = require('./zip');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const STAGE = path.join(DIST, 'stage');

/** Exactly what ships. Nothing reaches the zip that is not on this list. */
const SHIP = [
  'manifest.json',
  'popup.html',
  'popup.js',
  'content.js',
  'content.css',
  'ui.css',
  'fonts/poppins-300-latin.woff2',
  'fonts/poppins-500-latin.woff2',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

const problems = [];
function check(condition, message) {
  if (!condition) problems.push(message);
}

// ───────────────────────────────────────────────────────────── the allowlist
for (const rel of SHIP) {
  check(fs.existsSync(path.join(ROOT, rel)), `missing from the repo: ${rel}`);
}

// A missing file has to stop the run here rather than further down: every
// check below reads these files, and an unreadable one throws a stack trace
// over the top of the refusal that would have explained it.
if (problems.length) {
  console.error('Build refused:\n' + problems.map(p => '  - ' + p).join('\n'));
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────── the manifest
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const { version } = manifest;

check(/^\d+\.\d+(\.\d+){0,2}$/.test(version), `version "${version}" is not a Chrome version string`);
check(manifest.manifest_version === 3, 'manifest_version must be 3');

// The description IS the Web Store summary and the store truncates past 132.
check(
  manifest.description && manifest.description.length <= 132,
  `description is ${manifest.description ? manifest.description.length : 0} chars; the Web Store caps the summary at 132`
);

// The credit line that used to end the description spent 25 of those characters
// saying what the developer field already says.
check(
  !/developed by|a technerdxp product/i.test(manifest.description || ''),
  'the description carries a credit line; the listing already names the developer'
);

// Every path the manifest names has to be something we actually ship.
const manifestPaths = [
  ...Object.values(manifest.icons || {}),
  ...Object.values((manifest.action && manifest.action.default_icon) || {}),
  manifest.action && manifest.action.default_popup,
  manifest.options_page,
  manifest.background && manifest.background.service_worker,
  ...(manifest.content_scripts || []).flatMap(cs => [...(cs.js || []), ...(cs.css || [])])
].filter(Boolean);

for (const rel of manifestPaths) {
  check(SHIP.includes(rel), `manifest names "${rel}", which is not in the ship list`);
}

// ───────────────────────────────────────────── no permission we do not use
// An extension that asks for more than it uses gets a scarier install warning
// and a harder review, for nothing. Each declared permission has to appear in
// the code that ships.
const shippedJs = SHIP.filter(f => f.endsWith('.js'))
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

for (const perm of manifest.permissions || []) {
  check(new RegExp(`chrome\\.${perm}\\b`).test(shippedJs),
    `manifest declares "${perm}" but no shipped script uses chrome.${perm}`);
}

// chrome.tabs is used by the popup to ask the active tab for its count. That
// works on host permission alone; declaring "tabs" as well would add a warning
// about reading browsing history for no extra capability.
check(!(manifest.permissions || []).includes('tabs'),
  'the "tabs" permission is not needed — host permissions already allow messaging the active tab');

// ────────────────────────────────────────────────────── no remote code, MV3
// A remote <script src> is an outright rejection, and a remote stylesheet is a
// network round trip before the popup can paint.
for (const rel of SHIP.filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const remote = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)\s*=\s*["'](https?:|\/\/)[^"']*["']/gi)];
  for (const m of remote) {
    problems.push(`${rel} loads a remote asset: ${m[0].slice(0, 80)}`);
  }
}

// A webfont pulled off a CDN is the same problem one level down.
for (const rel of SHIP.filter(f => f.endsWith('.css'))) {
  const css = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of css.matchAll(/@import|url\(\s*["']?(https?:|\/\/)/gi)) {
    problems.push(`${rel} pulls a remote asset: ${m[0]}`);
  }
}

// ──────────────────────────────────────────── every local reference resolves
// Catches the classic: a stylesheet or font renamed on disk and not in the markup.
const localRefs = [];
for (const rel of SHIP.filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*?(?:src|href)\s*=\s*["']([^"':]+)["']/gi)) {
    localRefs.push([rel, m[1]]);
  }
}
for (const rel of SHIP.filter(f => f.endsWith('.css'))) {
  const css = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    if (!/^(data:|https?:)/i.test(m[1])) localRefs.push([rel, m[1]]);
  }
}
for (const [from, ref] of localRefs) {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(from.replace(/\\/g, '/')), ref));
  check(SHIP.includes(resolved), `${from} references "${ref}", which is not shipped`);
}

// ───────────────────────────────────────── nothing chatty on someone's site
// The content script runs on every mistore.pk page, inside a MutationObserver.
// A stray console.log there is noise in a stranger's devtools.
const contentJs = fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8');
const bareLogs = [...contentJs.matchAll(/^\s*console\.\w+\(/gm)];
check(bareLogs.length === 0,
  `content.js calls console directly ${bareLogs.length} time(s); route it through the DEBUG flag`);
check(/const DEBUG = false/.test(contentJs), 'content.js ships with DEBUG switched on');
check(!/window\.__\w*[Dd]ebug/.test(contentJs), 'content.js leaves a debug flag on the page window');

if (problems.length) {
  console.error('Build refused:\n' + problems.map(p => '  - ' + p).join('\n'));
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────── package
// manifest.json must sit at the zip root, so the STAGE directory's *contents*
// are what gets archived. Never Compress-Archive or .NET ZipFile: both write
// backslash entry paths on Windows and the structure arrives mangled.
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

for (const rel of SHIP) {
  const dest = path.join(STAGE, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ROOT, rel), dest);
}

const outFile = path.join(DIST, `mistorepk-hide-sold-out-${version}.zip`);
const entries = zipDirectory(STAGE, outFile);
fs.rmSync(STAGE, { recursive: true, force: true });

const { size } = fs.statSync(outFile);
console.log(`\n  ${path.relative(ROOT, outFile)}`);
console.log(`  ${entries.length} files, ${(size / 1024).toFixed(1)} KB\n`);
for (const e of entries) console.log('    ' + e);
console.log('');
