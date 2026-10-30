/*
 * tracker.js — automatic ball tracking on raw RGBA frames.
 * A frame is any {width, height, data} object (ImageData in the browser).
 * Pure functions, no DOM. Works in the browser (window.TP.tracker) and in Node.
 */
(function (root) {
  'use strict';

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function pixel(img, x, y) {
    const i = (clamp(y, 0, img.height - 1) * img.width + clamp(x, 0, img.width - 1)) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  }

  // Mean colour inside a disk.
  function meanColor(img, cx, cy, r) {
    let R = 0, G = 0, B = 0, n = 0;
    const rr = Math.max(1, r);
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy > rr * rr) continue;
        const p = pixel(img, Math.round(cx + dx), Math.round(cy + dy));
        R += p[0]; G += p[1]; B += p[2]; n++;
      }
    }
    return [R / n, G / n, B / n];
  }

  /*
   * Colour distance that tolerates shading: chromaticity (colour relative to brightness)
   * counts fully, brightness counts half. A lit and a shadowed side of the same ball stay close.
   */
  function colorDist2(d, i, c) {
    const l1 = (d[i] + d[i + 1] + d[i + 2]) / 3 + 20;
    const l2 = (c[0] + c[1] + c[2]) / 3 + 20;
    let s = 0;
    for (let k = 0; k < 3; k++) {
      const dc = 100 * (d[i + k] / l1 - c[k] / l2);
      s += dc * dc;
    }
    const dl = 0.5 * (l1 - l2);
    return s + dl * dl;
  }

  /*
   * Find the ball under a click: cast rays from the click and stop each one at the
   * strongest colour edge, then centre on the mean edge point and repeat once.
   * Returns the ball's centre, radius and mean colour.
   */
  function estimateBlob(img, x, y, maxR = 120) {
    const rays = 24;
    let cx = x, cy = y, r = 8;
    const at = (px, py) => pixel(img, Math.round(px), Math.round(py));
    const diff = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    for (let pass = 0; pass < 3; pass++) {
      const edges = [];
      for (let k = 0; k < rays; k++) {
        const ux = Math.cos((2 * Math.PI * k) / rays), uy = Math.sin((2 * Math.PI * k) / rays);
        let best = 0, bestD = 0;
        for (let dd = 2; dd < maxR; dd++) {
          const g = diff(at(cx + ux * (dd + 1), cy + uy * (dd + 1)), at(cx + ux * (dd - 1), cy + uy * (dd - 1)));
          if (g > best) { best = g; bestD = dd; }
        }
        edges.push({ d: bestD, x: cx + ux * bestD, y: cy + uy * bestD });
      }
      const sorted = edges.map((e) => e.d).sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const good = edges.filter((e) => Math.abs(e.d - med) <= Math.max(3, med * 0.35));
      if (good.length < rays / 3) break;
      cx = good.reduce((s, e) => s + e.x, 0) / good.length;
      cy = good.reduce((s, e) => s + e.y, 0) / good.length;
      r = med;
      maxR = Math.min(maxR, Math.round(med * 2.2) + 4);
    }
    return { x: cx, y: cy, r, color: meanColor(img, cx, cy, Math.max(1, Math.round(r * 0.6))) };
  }

  /*
   * Template: a square RGB patch of half-size r around (cx, cy).
   * `stride` subsamples large templates so matching stays fast.
   */
  function makeTemplate(img, cx, cy, r) {
    r = Math.max(3, Math.round(r));
    const stride = Math.max(1, Math.round(r / 12));
    const offsets = [];
    for (let dy = -r; dy <= r; dy += stride) for (let dx = -r; dx <= r; dx += stride) offsets.push(dx, dy);
    const values = new Float32Array((offsets.length / 2) * 3);
    sample(img, cx, cy, offsets, values);
    return { r, offsets, values };
  }

  function sample(img, cx, cy, offsets, out) {
    const x0 = Math.round(cx), y0 = Math.round(cy);
    for (let k = 0, j = 0; k < offsets.length; k += 2, j += 3) {
      const p = pixel(img, x0 + offsets[k], y0 + offsets[k + 1]);
      out[j] = p[0]; out[j + 1] = p[1]; out[j + 2] = p[2];
    }
    return out;
  }

  // Blend the template toward the patch at (cx, cy) so it follows slow changes in lighting/blur.
  function evolveTemplate(tpl, img, cx, cy, rate) {
    if (!rate) return;
    const now = sample(img, cx, cy, tpl.offsets, new Float32Array(tpl.values.length));
    for (let i = 0; i < now.length; i++) tpl.values[i] += rate * (now[i] - tpl.values[i]);
  }

  function ssdAt(img, tpl, x0, y0, bestSoFar) {
    const { offsets, values } = tpl;
    const W = img.width, H = img.height, d = img.data;
    let s = 0;
    for (let k = 0, j = 0; k < offsets.length; k += 2, j += 3) {
      const x = clamp(x0 + offsets[k], 0, W - 1);
      const y = clamp(y0 + offsets[k + 1], 0, H - 1);
      const i = (y * W + x) * 4;
      const dr = d[i] - values[j], dg = d[i + 1] - values[j + 1], db = d[i + 2] - values[j + 2];
      s += dr * dr + dg * dg + db * db;
      if (s > bestSoFar) return s;
    }
    return s;
  }

  /*
   * Search a square window of half-size searchR around the predicted position for the
   * best sum-of-squared-differences match, then refine to sub-pixel accuracy with a
   * parabola through the neighbouring scores. `score` is the RMS colour difference (0–255).
   */
  function matchTemplate(img, tpl, px, py, searchR) {
    const cx = Math.round(px), cy = Math.round(py);
    const R = Math.max(2, Math.round(searchR));
    let best = Infinity, bx = cx, by = cy;
    for (let y = cy - R; y <= cy + R; y++) {
      if (y < 0 || y >= img.height) continue;
      for (let x = cx - R; x <= cx + R; x++) {
        if (x < 0 || x >= img.width) continue;
        const s = ssdAt(img, tpl, x, y, best);
        if (s < best) { best = s; bx = x; by = y; }
      }
    }
    const sub = (m, c, p) => {
      const den = m - 2 * c + p;
      return den > 0 ? clamp(0.5 * (m - p) / den, -0.5, 0.5) : 0;
    };
    const fx = sub(ssdAt(img, tpl, bx - 1, by, Infinity), best, ssdAt(img, tpl, bx + 1, by, Infinity));
    const fy = sub(ssdAt(img, tpl, bx, by - 1, Infinity), best, ssdAt(img, tpl, bx, by + 1, Infinity));
    const count = tpl.values.length;
    return { x: bx + fx, y: by + fy, score: Math.sqrt(best / count) };
  }

  /*
   * Colour tracking: centroid of all pixels within `tol` of the ball colour inside the
   * search window, re-centred once on the first estimate. Robust to motion blur.
   */
  function colorCentroid(img, color, tol, px, py, searchR) {
    const tol2 = tol * tol;
    const W = img.width, H = img.height;
    let x = px, y = py, R = Math.max(4, Math.round(searchR));
    let result = null;
    for (let pass = 0; pass < 2; pass++) {
      let sx = 0, sy = 0, n = 0;
      const x0 = Math.max(0, Math.round(x - R)), x1 = Math.min(W - 1, Math.round(x + R));
      const y0 = Math.max(0, Math.round(y - R)), y1 = Math.min(H - 1, Math.round(y + R));
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          if (colorDist2(img.data, (yy * W + xx) * 4, color) <= tol2) { sx += xx; sy += yy; n++; }
        }
      }
      if (n < 5) return result;
      x = sx / n; y = sy / n;
      result = { x, y, count: n, r: Math.sqrt(n / Math.PI) };
      R = Math.max(6, Math.round(result.r * 2.5));
    }
    return result;
  }

  /*
   * Find a moving object with three-frame differencing: pixels that differ from both the
   * previous and the next frame belong to whatever was moving in the current frame.
   * Returns the largest such blob {x, y, r} or null.
   */
  function findMovingObject(prev, cur, next, threshold = 30) {
    const W = cur.width, H = cur.height;
    const step = W * H > 400000 ? 2 : 1;
    const gw = Math.floor(W / step), gh = Math.floor(H / step);
    const mask = new Uint8Array(gw * gh);
    const diff = (a, b, i) => Math.max(
      Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const i = (gy * step * W + gx * step) * 4;
        if (diff(cur, prev, i) > threshold && diff(cur, next, i) > threshold) mask[gy * gw + gx] = 1;
      }
    }
    let best = null;
    const queue = new Int32Array(gw * gh);
    for (let start = 0; start < mask.length; start++) {
      if (mask[start] !== 1) continue;
      let head = 0, tail = 0, sx = 0, sy = 0, n = 0;
      queue[tail++] = start; mask[start] = 2;
      while (head < tail) {
        const k = queue[head++];
        const kx = k % gw, ky = (k - kx) / gw;
        sx += kx; sy += ky; n++;
        const nb = [kx > 0 ? k - 1 : -1, kx < gw - 1 ? k + 1 : -1, ky > 0 ? k - gw : -1, ky < gh - 1 ? k + gw : -1];
        for (const m of nb) if (m >= 0 && mask[m] === 1) { mask[m] = 2; queue[tail++] = m; }
      }
      if (!best || n > best.n) best = { n, x: (sx / n) * step, y: (sy / n) * step };
    }
    if (!best || best.n * step * step < 12) return null;
    return { x: best.x, y: best.y, r: Math.sqrt((best.n * step * step) / Math.PI) };
  }

  /*
   * Predict the next position from the last tracked points (constant acceleration when
   * three are available). `history` is [{frame, x, y}] sorted by frame.
   */
  function predict(history, frame) {
    const h = history.slice(-3);
    const last = h[h.length - 1];
    if (h.length < 2) return { x: last.x, y: last.y, speed: 0 };
    const [a, b] = [h[h.length - 2], last];
    const df1 = b.frame - a.frame;
    const vx = (b.x - a.x) / df1, vy = (b.y - a.y) / df1;
    let ax = 0, ay = 0;
    if (h.length === 3) {
      const c = h[0];
      const df0 = a.frame - c.frame;
      ax = (vx - (a.x - c.x) / df0) / ((df0 + df1) / 2);
      ay = (vy - (a.y - c.y) / df0) / ((df0 + df1) / 2);
    }
    const dt = frame - b.frame;
    return {
      x: b.x + vx * dt + 0.5 * ax * dt * dt,
      y: b.y + vy * dt + 0.5 * ay * dt * dt,
      speed: Math.hypot(vx + ax * dt, vy + ay * dt) * dt,
    };
  }

  const api = {
    meanColor, estimateBlob, makeTemplate, evolveTemplate, matchTemplate,
    colorCentroid, findMovingObject, predict,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.TP = root.TP || {}).tracker = api;
})(typeof window !== 'undefined' ? window : globalThis);
