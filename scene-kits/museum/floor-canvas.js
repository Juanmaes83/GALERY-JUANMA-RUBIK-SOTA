/**
 * Museum Scene Kit — floor finishes drawn with the canvas 2D API (Misión Visual)
 *
 * Each finish is drawn, not computed pixel by pixel: boards, slabs, chips and
 * joints are rectangles and strokes rasterised by the browser's native 2D
 * engine, as textures.js has always done for the original floor. Measured on
 * the software rasteriser, the per-pixel generator it replaces cost ≈2.3 s of
 * CPU for the six rooms and its maps competed with rendering at start-up and
 * at every doorway; drawing costs a small fraction of that (see
 * docs/MISION-VISUAL.md).
 *
 * Two canvases per finish:
 *   colour — base colour (sRGB);
 *   relief — greyscale, used as both roughnessMap and bumpMap, exactly the
 *            pairing the original floor used (one texture, two roles).
 *
 * Everything is placed in metres inside a tile and wraps across its edges, so
 * the texture repeats seamlessly at physical scale. Deterministic from the
 * room's RNG; no third-party material (Constitution §29.1, IW-DEC-016).
 */

const PALETTE = {
  limestone: [189, 177, 158],
  oak: [163, 126, 89],
  'smoked-oak': [28, 20, 15],
  concrete: [143, 139, 131],
  terrazzo: [189, 181, 167],
  parquet: [143, 102, 64]
};

/** Physical tile (m), roughness the relief map is scaled to, bump strength. */
export const FINISH_SPEC = {
  limestone: { tile: 2.4, roughness: 0.62, bump: 0.006 },
  oak: { tile: 2.4, roughness: 0.6, bump: 0.005 },
  'smoked-oak': { tile: 2.4, roughness: 0.72, bump: 0.005 },
  concrete: { tile: 2.4, roughness: 0.55, bump: 0.006 },
  terrazzo: { tile: 1.2, roughness: 0.5, bump: 0.004 },
  parquet: { tile: 0.72, roughness: 0.58, bump: 0.004 }
};

const rgb = ([r, g, b], k = 1, a = 1) => `rgba(${Math.min(255, Math.round(r * k))},${Math.min(255, Math.round(g * k))},${Math.min(255, Math.round(b * k))},${a})`;
const grey = (v, a = 1) => `rgba(${v},${v},${v},${a})`;

/**
 * Draw on both canvases, repeating a shape across the tile edges it crosses.
 * `fn(ctx, dx, dy)` draws at an offset in pixels.
 */
function wrapped(ctxs, n, x, y, reach, fn) {
  const xs = [0]; const ys = [0];
  if (x < reach) xs.push(n); if (x > n - reach) xs.push(-n);
  if (y < reach) ys.push(n); if (y > n - reach) ys.push(-n);
  for (const ctx of ctxs) for (const dx of xs) for (const dy of ys) fn(ctx, dx, dy);
}

function blobs(ctx, rng, n, count, rMin, rMax, colourOf) {
  for (let i = 0; i < count; i += 1) {
    const x = rng.next() * n; const y = rng.next() * n; const r = rMin + rng.next() * (rMax - rMin);
    const c = colourOf(rng);
    wrapped([ctx], n, x, y, r, (g, dx, dy) => {
      const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grad.addColorStop(0, c); grad.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
      g.fillStyle = grad; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    });
  }
}

function dots(ctxs, rng, n, count, size, colourOf, reliefOf) {
  const [c, r] = ctxs;
  for (let i = 0; i < count; i += 1) {
    const x = rng.next() * n; const y = rng.next() * n; const s = size * (0.5 + rng.next());
    c.fillStyle = colourOf(rng); c.fillRect(x, y, s, s);
    if (reliefOf) { r.fillStyle = reliefOf(rng); r.fillRect(x, y, s, s); }
  }
}

/** Grain: long, slightly wavering strokes along x inside a band [y0, y1). */
function grain(ctxs, rng, x0, x1, y0, y1, count, base, reliefMid) {
  const [c, r] = ctxs;
  for (let i = 0; i < count; i += 1) {
    const y = y0 + rng.next() * (y1 - y0);
    const w = 0.6 + rng.next() * 1.8;
    const light = rng.next() > 0.5;
    const a = 0.1 + rng.next() * 0.18;
    const wob = (y1 - y0) * 0.06;
    const path = (g) => { g.beginPath(); g.moveTo(x0, y); g.bezierCurveTo(x0 + (x1 - x0) * 0.33, y + (rng.next() - 0.5) * wob, x0 + (x1 - x0) * 0.66, y + (rng.next() - 0.5) * wob, x1, y + (rng.next() - 0.5) * wob * 0.5); };
    c.lineWidth = w; c.strokeStyle = rgb(base, light ? 1.25 : 0.7, a); path(c); c.stroke();
    r.lineWidth = w; r.strokeStyle = grey(light ? reliefMid + 30 : reliefMid - 30, a * 1.5); path(r); r.stroke();
  }
}

function boards({ ctxs, rng, n, tile, base, reliefMid, board, toneSpread, lengths, grainPerBoard }) {
  const [c, r] = ctxs;
  const s = n / tile;
  const rows = Math.round(tile / board);
  const bh = n / rows;
  const jw = Math.max(1, 0.0016 * s);
  for (let row = 0; row < rows; row += 1) {
    // Board lengths divide the tile, so a row of boards repeats exactly.
    const len = lengths[Math.floor(rng.next() * lengths.length)] * s;
    const off = rng.next() * len;
    const y0 = row * bh; const y1 = y0 + bh;
    for (let k = 0; k < Math.round(n / len); k += 1) {
      const start = off + k * len;
      const tone = 1 + (rng.next() - 0.5) * toneSpread;
      // One board, one tone: a board that crosses the tile edge is drawn in
      // two pieces with the same tone and grain density.
      const pieces = start + len <= n ? [[start, start + len]] : [[start, n], [0, start + len - n]];
      for (const [x0, xe] of pieces) {
        c.fillStyle = rgb(base, tone); c.fillRect(x0, y0, xe - x0, bh);
        r.fillStyle = grey(Math.round(reliefMid + (tone - 1) * 60)); r.fillRect(x0, y0, xe - x0, bh);
        grain(ctxs, rng, x0, xe, y0, y1, grainPerBoard * (xe - x0) / n, base, reliefMid);
      }
      for (const [g, st] of [[c, rgb(base, 0.42)], [r, grey(30)]]) { g.fillStyle = st; g.fillRect(start % n, y0, jw, bh); }
    }
    for (const [g, st] of [[c, rgb(base, 0.42)], [r, grey(30)]]) { g.fillStyle = st; g.fillRect(0, y0, n, jw); }
  }
}

const DRAW = {
  limestone({ ctxs, rng, n, tile, base }) {
    const [c, r] = ctxs; const s = n / tile;
    // Slabs 1.2 × 0.6 m in running bond, each its own tone.
    for (let row = 0; row < 4; row += 1) {
      const shift = (row % 2) * 0.6 * s;
      // Two slabs per row in a 2.4 m tile; the shifted row's slab that crosses
      // the edge (col −1 and col 1) is one slab, so one tone.
      const tones = [1 + (rng.next() - 0.5) * 0.09, 1 + (rng.next() - 0.5) * 0.09];
      for (let col = -1; col < 2; col += 1) {
        const tone = tones[((col % 2) + 2) % 2];
        const x = col * 1.2 * s + shift; const y = row * 0.6 * s;
        c.fillStyle = rgb(base, tone); c.fillRect(x, y, 1.2 * s, 0.6 * s);
        r.fillStyle = grey(Math.round(150 + (tone - 1) * 80)); r.fillRect(x, y, 1.2 * s, 0.6 * s);
      }
    }
    blobs(c, rng, n, 140, n * 0.03, n * 0.12, (g) => rgb(base, g.next() > 0.5 ? 1.08 : 0.92, 0.18));
    blobs(r, rng, n, 80, n * 0.02, n * 0.08, (g) => grey(g.next() > 0.5 ? 175 : 125, 0.25));
    dots(ctxs, rng, n, 900, Math.max(1, s * 0.0025), () => rgb(base, 0.8, 0.5), () => grey(110, 0.6));
    const jw = Math.max(1.2, 0.0035 * s);
    for (let row = 0; row <= 4; row += 1) for (const [g, st] of [[c, rgb(base, 0.55)], [r, grey(35)]]) { g.fillStyle = st; g.fillRect(0, row * 0.6 * s - jw / 2, n, jw); }
    for (let row = 0; row < 4; row += 1) {
      const shift = (row % 2) * 0.6 * s;
      for (let col = 0; col <= 2; col += 1) for (const [g, st] of [[c, rgb(base, 0.55)], [r, grey(35)]]) { g.fillStyle = st; g.fillRect(col * 1.2 * s + shift - jw / 2, row * 0.6 * s, jw, 0.6 * s); }
    }
  },

  oak(args) {
    boards({ ...args, reliefMid: 140, board: 0.2, toneSpread: 0.24, lengths: [0.8, 1.2, 2.4], grainPerBoard: 150 });
  },

  'smoked-oak'(args) {
    boards({ ...args, reliefMid: 165, board: 0.2, toneSpread: 0.22, lengths: [0.8, 1.2, 2.4], grainPerBoard: 120 });
  },

  concrete({ ctxs, rng, n, tile, base }) {
    const [c, r] = ctxs; const s = n / tile;
    c.fillStyle = rgb(base); c.fillRect(0, 0, n, n);
    r.fillStyle = grey(140); r.fillRect(0, 0, n, n);
    blobs(c, rng, n, 45, n * 0.12, n * 0.35, (g) => rgb(base, g.next() > 0.5 ? 1.12 : 0.88, 0.22));
    blobs(r, rng, n, 45, n * 0.12, n * 0.35, (g) => grey(g.next() > 0.5 ? 175 : 100, 0.3));
    blobs(c, rng, n, 260, n * 0.015, n * 0.05, (g) => rgb(base, g.next() > 0.5 ? 1.06 : 0.94, 0.25));
    dots(ctxs, rng, n, 3500, Math.max(1, s * 0.002), (g) => rgb(base, g.next() > 0.5 ? 1.15 : 0.82, 0.6), (g) => grey(g.next() > 0.5 ? 190 : 90, 0.6));
    const jw = Math.max(1.2, 0.003 * s);
    for (const k of [0, 1, 2]) for (const [g, st] of [[c, rgb(base, 0.45)], [r, grey(30)]]) {
      g.fillStyle = st; g.fillRect(0, k * 1.2 * s - jw / 2, n, jw); g.fillRect(k * 1.2 * s - jw / 2, 0, jw, n);
    }
  },

  terrazzo({ ctxs, rng, n, tile, base }) {
    const [c, r] = ctxs; const s = n / tile;
    c.fillStyle = rgb(base); c.fillRect(0, 0, n, n);
    r.fillStyle = grey(150); r.fillRect(0, 0, n, n);
    blobs(c, rng, n, 30, n * 0.08, n * 0.25, (g) => rgb(base, g.next() > 0.5 ? 1.05 : 0.95, 0.25));
    const colours = [[242, 237, 224], [140, 135, 128], [184, 143, 97], [51, 48, 46], [219, 204, 179]];
    const cells = 26;
    for (let j = 0; j < cells; j += 1) for (let i = 0; i < cells; i += 1) {
      const x = (i + rng.next()) / cells * n; const y = (j + rng.next()) / cells * n;
      const rad = (0.25 + rng.next() * 0.33) / cells * n;
      const col = colours[Math.floor(rng.next() * colours.length)]; const t = 1 + (rng.next() - 0.5) * 0.12;
      const rot = rng.next() * Math.PI; const squash = 0.6 + rng.next() * 0.4;
      wrapped(ctxs, n, x, y, rad, (g, dx, dy) => {
        g.fillStyle = g === c ? rgb(col, t) : grey(185);
        g.beginPath(); g.ellipse(x + dx, y + dy, rad, rad * squash, rot, 0, Math.PI * 2); g.fill();
      });
    }
    const bw = Math.max(1.2, 0.003 * s);
    for (const [g, st] of [[c, 'rgba(168,130,69,1)'], [r, grey(200)]]) { g.fillStyle = st; g.fillRect(0, 0, n, bw); g.fillRect(0, 0, bw, n); }
  },

  parquet({ ctxs, rng, n, tile, base }) {
    const [c, r] = ctxs; const s = n / tile;
    const sq = 0.36 * s; const slat = 0.09 * s;
    for (let qy = 0; qy < 2; qy += 1) for (let qx = 0; qx < 2; qx += 1) {
      const horizontal = (qx + qy) % 2 === 0;
      for (let k = 0; k < 4; k += 1) {
        const tone = 1 + (rng.next() - 0.5) * 0.22;
        const x = qx * sq + (horizontal ? 0 : k * slat); const y = qy * sq + (horizontal ? k * slat : 0);
        const w = horizontal ? sq : slat; const h = horizontal ? slat : sq;
        c.fillStyle = rgb(base, tone); c.fillRect(x, y, w, h);
        r.fillStyle = grey(Math.round(140 + (tone - 1) * 60)); r.fillRect(x, y, w, h);
        // Grain along the slat.
        c.save(); r.save();
        for (const g of ctxs) { g.beginPath(); g.rect(x, y, w, h); g.clip(); }
        if (horizontal) grain(ctxs, rng, x, x + w, y, y + h, 26, base, 140);
        else {
          for (const g of ctxs) { g.translate(x + w, y); g.rotate(Math.PI / 2); }
          grain(ctxs, rng, 0, h, 0, w, 26, base, 140);
        }
        c.restore(); r.restore();
        const gw = Math.max(1, 0.0012 * s);
        for (const [g, st] of [[c, rgb(base, 0.5)], [r, grey(35)]]) { g.fillStyle = st; g.fillRect(x, y, w, gw); g.fillRect(x, y, gw, h); }
      }
    }
  }
};

/**
 * @param {import('../../engine/core/rng.js').DeterministicRNG} rng
 * @param {string} finish
 * @param {{texelsPerMetre:number}} options
 * @returns {{colour:HTMLCanvasElement, relief:HTMLCanvasElement, tile:number, roughness:number, bump:number}}
 */
export function drawFloor(rng, finish, { texelsPerMetre = 427 } = {}) {
  const name = DRAW[finish] ? finish : 'concrete';
  const spec = FINISH_SPEC[name];
  const n = Math.min(1024, Math.max(256, 2 ** Math.ceil(Math.log2(spec.tile * texelsPerMetre))));
  const colour = document.createElement('canvas');
  const relief = document.createElement('canvas');
  colour.width = colour.height = relief.width = relief.height = n;
  const ctxs = [colour.getContext('2d'), relief.getContext('2d')];
  DRAW[name]({ ctxs, rng, n, tile: spec.tile, base: PALETTE[name] });
  return { colour, relief, tile: spec.tile, roughness: spec.roughness, bump: spec.bump, finish: name };
}
