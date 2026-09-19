/**
 * Hide Sold Out — Icon Generator
 *
 *   node tooling_/gen-icons.js      →  icons/icon{16,32,48,128}.png + icons/mark.svg
 *
 * Run this FIRST. gen-promo.js and gen-shots.js both read icons/mark.svg, so the
 * geometry lives here and nowhere else.
 *
 * ---------------------------------------------------------------------------
 * THE MARK: a four-tile grid with one tile hollowed out.
 *
 * WHY THIS SHAPE. The product does exactly one thing to a product grid: it takes
 * a tile out of it. The mark is that sentence with nothing else in it — three
 * solid tiles and a fourth reduced to its outline. In Hide the tile is gone; in
 * Peek it is a ghost of itself. One drawing covers both states because both
 * states are the same idea at different strengths.
 *
 * TRANSPARENT, NOT PLATED. The old icon was a bevelled orange rounded square
 * with an eye and a slash on it. Two problems. A plate is a badge glued onto the
 * toolbar rather than a mark living in it, and Chrome supplies its own ground —
 * light, dark, and the grey of the extensions page — which a plate fights in
 * every one of them. The eye, meanwhile, is every privacy extension ever
 * shipped, and at 16px the slash across it collapsed into a smudge.
 *
 * NO LETTERS, NO BEVEL, NO GLOSS, NO SHADOW, NO GLOW. All of them vanish below
 * 48px and date the drawing above it.
 *
 * COLOUR: the store's own orange, flat. No gradient — a four-tile grid is small
 * geometry, and a gradient across 6px of tile is noise. The old icon was orange
 * too, but orange poured over a bevelled plate behind an eye; the objection was
 * never the hue on its own.
 *
 * OPTICAL SIZING: 16 and 32 get fatter tiles, a tighter gap and a heavier
 * outline stroke, because scaling the 128 drawing down thins the hollow tile's
 * wall into a scratch and closes its hole. 48 and 128 get the considered
 * version. Two drawings, not one drawing scaled.
 * ---------------------------------------------------------------------------
 *
 * Geometry, on a 128 canvas:
 *   Four tiles in a 2x2. `cell` is the tile, `gap` the space between, and the
 *   whole block is centred by construction: margin = (128 - 2*cell - gap) / 2.
 *   The bottom-right tile is drawn as a stroked rectangle inset by half the
 *   stroke, so its outer edge lands exactly where the solid tiles' edges land.
 */

const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'icons');

/** The one accent. Stated once, here; ui.css names the same value. */
const BRAND = '#FF6900';

// Fine: 48 and 128, where a 12-unit radius and an 11-unit wall have room.
const FINE = { cell: 50, gap: 12, radius: 12, stroke: 11 };

// Bold: 16 and 32. Bigger tiles, smaller gap, thicker wall — so that at 16px
// the hollow tile still reads as a ring and not as a filled blob.
const BOLD = { cell: 56, gap: 8, radius: 10, stroke: 13 };

function markSvg(size, g) {
  const margin = (128 - 2 * g.cell - g.gap) / 2;
  const x0 = margin;
  const x1 = margin + g.cell + g.gap;

  const solid = (x, y) =>
    `<rect x="${x}" y="${y}" width="${g.cell}" height="${g.cell}" rx="${g.radius}" fill="${BRAND}"/>`;

  // Inset by half the stroke so the painted outer edge aligns with the solids.
  const h = g.stroke / 2;
  const hollow = (x, y) =>
    `<rect x="${x + h}" y="${y + h}" width="${g.cell - g.stroke}" height="${g.cell - g.stroke}" ` +
    `rx="${Math.max(g.radius - h, 2)}" fill="none" stroke="${BRAND}" stroke-width="${g.stroke}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}">
  ${solid(x0, x0)}
  ${solid(x1, x0)}
  ${solid(x0, x1)}
  ${hollow(x1, x1)}
</svg>`;
}

const SIZES = [
  [16, BOLD],
  [32, BOLD],
  [48, FINE],
  [128, FINE]
];

fs.mkdirSync(OUT, { recursive: true });

for (const [size, g] of SIZES) {
  const svg = markSvg(size, g);
  // Icons keep their alpha — the mark has no ground of its own, which is the
  // whole point. Only the store graphics get flattened.
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(path.join(OUT, `icon${size}.png`), png);
  console.log(`icon${size}.png  ${png.length} bytes`);
}

// The intermediate the promo and screenshot generators read. Never packaged.
fs.writeFileSync(path.join(OUT, 'mark.svg'), markSvg(128, FINE));
console.log('mark.svg');
