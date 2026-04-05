# MiStorePK Hide Sold Out

A tiny Chrome extension that hides sold-out product listings on **mestore.pk** so you only see items you can actually buy.

---

## Install

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked** → select this folder
4. Browse mestore.pk — sold-out cards disappear automatically

---

## How it works

`content.js` runs on every mestore.pk page and does two passes:

| Pass | Selector used | Why it's reliable |
|------|--------------|-------------------|
| Primary | `div.price--sold-out` → `closest('li.grid__item')` | Shopify Dawn theme adds `price--sold-out` to the price block of every fully out-of-stock product. Rock-solid. |
| Secondary | `.badge` with text `"Sold out"` → `closest('li.grid__item')` | Catches edge cases on custom sections where the price class may be absent. |

A debounced `MutationObserver` re-runs the scan whenever new cards are injected (slider navigation, collection filters, infinite scroll).

---

## Selectors that may need updating if the site changes

If sold-out products start reappearing after a site update, one of these has likely changed:

### 1. `div.price--sold-out`
**What it is:** A CSS class applied by Shopify's Dawn theme to the price wrapper of unavailable products.  
**Where to verify:** Inspect a sold-out product card → look for a `<div class="price price--sold-out ...">` inside the card.  
**If removed/renamed:** Update the selector on **line 13** of `content.js`.

### 2. `li.grid__item`
**What it is:** The `<li>` element that wraps each product card in the grid.  
**Where to verify:** Inspect the product grid → each tile is `<li class="grid__item">` inside a `<ul class="product-grid ...">`.  
**If changed:** Update both `.closest('li.grid__item')` calls on **lines 14 and 21** of `content.js`.

### 3. `.badge` text content
**What it is:** The visible sold-out label rendered inside product cards.  
**Where to verify:** Inspect the orange/red badge on a sold-out tile.  
**If the label text changes** (e.g. becomes "Out of Stock"): Add it to the condition on **line 20** of `content.js`.

### 4. Grid container ID
The product grid lives inside:
```
#Slider-template--15573637202000__featured_collection_Eq8BpA
```
This ID encodes the Shopify section ID and changes if the homepage section is deleted and recreated. The current script does **not** scope to this ID (it scans the whole page), so a section ID change will not break anything.  
If you ever want to scope scanning to a specific section, wrap `querySelectorAll` in:
```js
document.querySelector('#Slider-<your-new-id>').querySelectorAll(...)
```

---

## Files

```
├── manifest.json          Chrome extension manifest (Manifest V3)
├── content.js             The hide logic — runs on every mestore.pk page
├── generate_icons.py      Script that created the icons (Python + Pillow)
├── img/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── pillars_off_creation/  Reference HTML snapshots used during development
```

---

## Adapting for another Shopify store

1. Change the `matches` URLs in `manifest.json` to the new domain.
2. Inspect a sold-out product card on that store and find:
   - The class on the sold-out price block (replace `price--sold-out`)
   - The tag/class of the product card wrapper (replace `li.grid__item`)
3. Update those two values in `content.js` and reload the extension.
