/*
 * demo.js — a synthetic 120 fps clip of a ball falling past a metre stick.
 * Frames are rendered straight into RGBA buffers so the same clip drives the browser
 * demo and the Node tests. The true motion is known, so it doubles as a check on the tracker.
 */
(function (root) {
  'use strict';

  const DEMO = {
    width: 960,
    height: 540,
    fps: 120,
    frames: 60,
    pxPerMetre: 300,
    floorY: 500,            // pixel row of height 0
    stick: { x: 150, length: 1.0 },
    ball: { radius: 0.04, x0: 1.2, vx: 0.12, h0: 1.55, vy0: -0.3, color: [232, 112, 28] },
    g: 9.81,
  };

  // True ball position (pixels) at frame i.
  function ballAt(i, t = i / DEMO.fps) {
    const b = DEMO.ball;
    const h = b.h0 + b.vy0 * t - 0.5 * DEMO.g * t * t;
    return { x: DEMO.stick.x + (b.x0 + b.vx * t) * DEMO.pxPerMetre, y: DEMO.floorY - h * DEMO.pxPerMetre };
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Static scene: tiled wall, floor and a metre stick in 10 cm bands.
  function renderBackground() {
    const { width: W, height: H, floorY, pxPerMetre } = DEMO;
    const data = new Uint8ClampedArray(W * H * 4);
    const stickTop = floorY - DEMO.stick.length * pxPerMetre;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let r, g, b;
        if (y >= floorY) {
          const k = 1 - (y - floorY) / (H - floorY) * 0.25;
          r = 120 * k; g = 112 * k; b = 104 * k;
        } else {
          const k = 0.92 + 0.08 * (y / floorY);
          r = 206 * k; g = 214 * k; b = 220 * k;
          if (x % 80 === 0 || y % 80 === 0) { r -= 18; g -= 18; b -= 16; }
        }
        const sx = x - DEMO.stick.x;
        if (sx >= -8 && sx < 8 && y >= stickTop && y < floorY) {
          const band = Math.floor((floorY - y) / (pxPerMetre * 0.1));
          [r, g, b] = band % 2 ? [30, 30, 34] : [240, 200, 40];
        }
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      }
    }
    return { width: W, height: H, data };
  }

  /*
   * Render frame i on top of `background` into `out` (an ImageData-like object).
   * The ball is motion-blurred over a 1/500 s shutter and the frame gets sensor noise.
   */
  function renderFrame(i, background, out) {
    const { width: W, height: H } = DEMO;
    out.data.set(background.data);
    const r = DEMO.ball.radius * DEMO.pxPerMetre;
    const shutter = 1 / 500, subs = 5;
    const centres = [];
    for (let s = 0; s < subs; s++) centres.push(ballAt(i, i / DEMO.fps + (s / (subs - 1) - 0.5) * shutter));
    const [cr, cg, cb] = DEMO.ball.color;
    const minX = Math.floor(Math.min(...centres.map((c) => c.x)) - r - 2);
    const maxX = Math.ceil(Math.max(...centres.map((c) => c.x)) + r + 2);
    const minY = Math.floor(Math.min(...centres.map((c) => c.y)) - r - 2);
    const maxY = Math.ceil(Math.max(...centres.map((c) => c.y)) + r + 2);
    for (let y = Math.max(0, minY); y <= Math.min(H - 1, maxY); y++) {
      for (let x = Math.max(0, minX); x <= Math.min(W - 1, maxX); x++) {
        let cover = 0, shade = 0;
        for (const c of centres) {
          const dx = x + 0.5 - c.x, dy = y + 0.5 - c.y;
          const a = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(dx, dy)));
          cover += a;
          shade += a * Math.min(1.25, Math.max(0.55, 0.9 - (dx + dy) / (r * 2.2)));
        }
        if (cover <= 0) continue;
        const a = cover / subs, s = shade / cover;
        const k = (y * W + x) * 4;
        out.data[k] = out.data[k] * (1 - a) + cr * s * a;
        out.data[k + 1] = out.data[k + 1] * (1 - a) + cg * s * a;
        out.data[k + 2] = out.data[k + 2] * (1 - a) + cb * s * a;
      }
    }
    const rand = mulberry32(1000 + i);
    for (let k = 0; k < out.data.length; k += 4) {
      const n = (rand() + rand() + rand() - 1.5) * 8;
      out.data[k] += n; out.data[k + 1] += n; out.data[k + 2] += n;
    }
    return out;
  }

  const api = { DEMO, ballAt, renderBackground, renderFrame };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.TP = root.TP || {}).demo = api;
})(typeof window !== 'undefined' ? window : globalThis);
