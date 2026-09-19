# MiStorePK Hide Sold Out

A Chrome extension for **mistore.pk**. Sold-out products either leave the grid
or stay in it dimmed, and you choose which from the toolbar.

- **Hide** (default) — sold-out cards are removed and the grid closes up.
- **Peek** — they stay in place, dimmed and greyed, with the store's own
  "Sold out" label showing. Still clickable.

The mode lives in `chrome.storage.sync`, so the toggle applies to every open
mistore.pk tab at once with no reload, and follows you between computers.

---

## Install for development

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → this folder
3. Open mistore.pk

Note that from Chrome 137 the `--load-extension` command-line flag is refused
outright by stable Google Chrome ("not allowed in Google Chrome, ignoring"), so
the scripts below that need the extension actually running use a Chrome for
Testing build instead. Loading it by hand in your own browser is unaffected.

---

## Layout

```
manifest.json          MV3. The one permission is storage.
content.js             Tags sold-out cards; listens for the mode. Silent.
content.css            The two states. Injected before the page paints.
popup.html/.js         Count, toggle, signature.
ui.css                 The popup's whole design system, dark and light.
fonts/                 Poppins 300 and 500, bundled. No CDN.
icons/                 16/32/48/128 + mark.svg (an intermediate, never shipped)
store/                 Listing copy and the six store graphics (not committed)
tooling_/              Generators, the build, and the verification harness
pillars_off_creation/  Captured mistore.pk markup for selector work (not committed)
```

---

## How it works

`content.js` runs at `document_start` and tags every sold-out card with
`mshs-sold`; `content.css` decides what that means, according to a
`mshs-mode-hide` or `mshs-mode-peek` class on `<html>`. Changing the mode is one
class swap on one element, which is why it can be applied live to a grid that is
already on screen.

Two passes find the cards:

| Pass | Selector | Why |
|---|---|---|
| Primary | `.price--sold-out` → `closest('li.grid__item')` | Dawn adds this to the price block of a product with no variant in stock |
| Secondary | `.badge` whose text is exactly "Sold out" or "Out of stock" | Catches sections with a custom price block |

The exact text test in the second pass is load-bearing: on this store `.badge`
is also worn by the "New" flag and the sale-percentage chip, and matching on the
class alone would hide products that are perfectly available.

A debounced `MutationObserver` re-runs the scan when the theme injects cards —
slider navigation, collection filters, infinite scroll.

**If sold-out products start reappearing after a site redesign**, one of the two
selectors above has changed. Inspect a sold-out card, find what replaced it, and
update the constant at the top of `content.js`.

### Peek and the store's hidden label

This store renders a "Sold out" badge on every sold-out card and then holds it
at `opacity: 0` until the card is hovered — verified across collection pages,
search and the homepage: every sold-out card had one in the DOM, none was
visible. Peek therefore reveals the badge the theme already drew rather than
adding one. Delete the `.mshs-sold-label` rule in `content.css` and Peek becomes
pure dimming, which was the original intent before the page was measured.

---

## The brand rule

The colour is `#FF6900`, the store's own orange, chosen so the popup reads as
part of the task. On light it darkens to `#C24A00`, which is the same hue pulled
only as far as 4.5:1 as type demands — the pure orange manages 2.89:1 on white.
One accent; there is no second.

Type is Poppins 300 and 500, bundled as woff2, no CDN, no bold, no italic, no
third weight. Tracking rises as size falls.

**The parent appears once per surface** and nowhere else: the TechNerdXp
wordmark alone in the footer, Silver, with one Signal Green shard through the
`h`, linking to technerdxp.com, never styled as a button. There is no credit
line — not "a TechNerdXp product", not "Developed by TechNerdXp". The shard is
the only green in the product and is never recoloured to the accent.

Wearing the store's orange is the one rule this product bends, and it is worth
naming: that colour belongs to mistore.pk. The listing states that the extension
is unaffiliated, the mark is nothing like Xiaomi's, and no store logo appears on
any surface. Reverting is two tokens in `ui.css` plus `BRAND` in
`tooling_/gen-icons.js`. The listing copy in `store/` — which is kept local, not
committed — carries the related note on the product's name.

---

## Regenerating everything

Order matters: **`gen-icons.js` runs first**, because `gen-promo.js` and
`gen-shots.js` both read the `icons/mark.svg` it writes.

```sh
node tooling_/gen-icons.js     # icons/icon{16,32,48,128}.png + icons/mark.svg
node tooling_/gen-promo.js     # store/assets/promo-{small,marquee}.png
node tooling_/gen-shots.js     # store/assets/screenshot-*.png  (1280x800)
node tooling_/build.js         # dist/mistorepk-hide-sold-out-<version>.zip
```

`gen-icons.js` rasterises SVG with resvg and is the only one that needs no
browser. The other two drive headless Chrome, because the graphics are captures
of the live store with the extension running — and because resvg cannot read
woff2 and would silently drop every glyph.

Both need a Chrome for Testing build, for the `--load-extension` reason above:

```sh
npx @puppeteer/browsers install chrome@stable
export MSHS_CHROME=".../chrome-win64/chrome.exe"     # set MSHS_CHROME=... on cmd
```

Without it they warn and would capture the site *without* the extension, which
is the one thing these pictures must never be.

### Verifying

```sh
node tooling_/verify-live.js   # the real extension against the real store
node tooling_/sheet-popup.js   # the popup: dark and light, Hide and Peek
node tooling_/sheet-icons.js   # every icon size on four grounds
```

`verify-live.js` loads the extension, opens a live collection page, then drives
the real popup in a second tab and asserts that the first tab changes without
reloading. It fails the run if the tag lands anywhere but an `li.grid__item`, if
Hide leaves a card in layout, if Peek removes one, if Peek is not at 0.38, if
the cards stop being clickable, if the popup's count disagrees with the page, or
if the content script says a single word to the console.

The two sheets write to `tooling_/_verify/`, which is not committed. Look at
them. The icon sheet is what catches a mark that dissolves at 16px, and the
popup sheet is what catches a surface that overruns its frame.

---

## Packaging

`build.js` packages from an explicit allowlist, never an exclude list — an
exclude list ships whatever gets added next. It refuses to build if the summary
is over 132 characters or carries a credit line, if a declared permission is
unused, if `tabs` is declared (host permissions already allow messaging the
active tab), if any HTML or CSS references something remote, if a local
reference does not resolve, or if `content.js` calls `console` directly or ships
with `DEBUG` on. Each of those refusals has been confirmed by breaking the thing
on purpose.

Never use `Compress-Archive` or .NET `ZipFile`: both write backslash entry paths
on Windows and the package arrives mangled. `tooling_/zip.js` writes the zip.

---

## Adapting for another Shopify store

1. Change `matches` and `host_permissions` in `manifest.json`.
2. Inspect a sold-out card on the new store and update `CARD` and the two
   selectors in `content.js`.
3. Check whether that theme shows its sold-out label — if it does, delete the
   `.mshs-sold-label` rule from `content.css`.
