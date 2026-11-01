/*
 * physics.js — least-squares fitting and free-fall analysis.
 * Pure functions, no DOM. Works in the browser (window.TP.physics) and in Node.
 */
(function (root) {
  'use strict';

  // Solve the square system A·x = b in place with partial pivoting; returns x.
  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.slice().concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-300) throw new Error('Singular matrix');
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }

  function invert(A) {
    const n = A.length;
    return A.map((_, j) => solve(A, A.map((__, i) => (i === j ? 1 : 0))))
      .reduce((inv, col, j) => { col.forEach((v, i) => { inv[i][j] = v; }); return inv; },
        A.map(() => new Array(n).fill(0)));
  }

  /*
   * Polynomial least squares: y ≈ c[0] + c[1]·t + c[2]·t² + …
   * Returns coefficients, their standard errors, R² and the residual RMS.
   */
  function polyfit(t, y, degree) {
    const n = t.length;
    const m = degree + 1;
    if (n < m) return null;
    const XtX = Array.from({ length: m }, () => new Array(m).fill(0));
    const Xty = new Array(m).fill(0);
    for (let i = 0; i < n; i++) {
      const pow = [1];
      for (let k = 1; k < m; k++) pow.push(pow[k - 1] * t[i]);
      for (let r = 0; r < m; r++) {
        Xty[r] += pow[r] * y[i];
        for (let c = 0; c < m; c++) XtX[r][c] += pow[r] * pow[c];
      }
    }
    let coef;
    try { coef = solve(XtX, Xty); } catch (e) { return null; }

    const evalAt = (tt) => coef.reduce((s, c, k) => s + c * Math.pow(tt, k), 0);
    const mean = y.reduce((s, v) => s + v, 0) / n;
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) {
      ssRes += (y[i] - evalAt(t[i])) ** 2;
      ssTot += (y[i] - mean) ** 2;
    }
    const dof = n - m;
    let stderr = new Array(m).fill(NaN);
    if (dof > 0) {
      const s2 = ssRes / dof;
      try { stderr = invert(XtX).map((row, i) => Math.sqrt(Math.max(0, s2 * row[i]))); } catch (e) { /* keep NaN */ }
    }
    return {
      coef,
      stderr,
      r2: ssTot > 0 ? 1 - ssRes / ssTot : 1,
      rms: Math.sqrt(ssRes / n),
      n,
      eval: evalAt,
    };
  }

  // Central-difference velocities (interior points only), tolerant of gaps in t.
  function velocities(t, v) {
    const out = [];
    for (let i = 1; i < t.length - 1; i++) {
      const dt = t[i + 1] - t[i - 1];
      if (dt > 0) out.push({ t: t[i], v: (v[i + 1] - v[i - 1]) / dt });
    }
    return out;
  }

  /*
   * Analyse a tracked free-fall: points = [{t, x, y}] in seconds and metres, y up.
   * Main estimate: quadratic fit y(t) = y0 + v0·t − ½g·t²  →  g = −2·c2.
   * Cross-check: linear fit of the finite-difference vy(t)  →  g = −slope.
   */
  function analyzeFreeFall(points) {
    const pts = points.slice().sort((a, b) => a.t - b.t);
    if (pts.length < 4) return null;
    const t = pts.map((p) => p.t);
    const x = pts.map((p) => p.x);
    const y = pts.map((p) => p.y);

    const fitY = polyfit(t, y, 2);
    if (!fitY) return null;
    const fitX = polyfit(t, x, 1);
    const vy = velocities(t, y);
    const vx = velocities(t, x);
    const fitV = vy.length >= 3 ? polyfit(vy.map((p) => p.t), vy.map((p) => p.v), 1) : null;

    const ys = y.slice().sort((a, b) => a - b);
    return {
      n: pts.length,
      t, x, y, vy, vx,
      fitY, fitX, fitV,
      g: -2 * fitY.coef[2],
      gErr: 2 * fitY.stderr[2],
      y0: fitY.coef[0],
      v0y: fitY.coef[1],
      vx0: fitX ? fitX.coef[1] : NaN,
      gFromV: fitV ? -fitV.coef[1] : NaN,
      gFromVErr: fitV ? fitV.stderr[1] : NaN,
      drop: ys[ys.length - 1] - ys[0],
      duration: t[t.length - 1] - t[0],
    };
  }

  /*
   * Drop-height method: a ball let go from rest falls a distance h (m) in the time between the
   * release frame and the landing frame, so h = ½·g·t² and g = 2h/t².
   * Each of the two frames is uncertain by about half a frame, so t is uncertain by about one
   * frame period; that and the height uncertainty hErr give the uncertainty in g.
   */
  function dropG(h, hErr, releaseFrame, landingFrame, fps) {
    const frames = landingFrame - releaseFrame;
    if (!(h > 0) || !(fps > 0) || !(frames > 0)) return null;
    const t = frames / fps;
    const tErr = 1 / fps;
    const g = (2 * h) / (t * t);
    const gErr = g * Math.sqrt(((hErr || 0) / h) ** 2 + ((2 * tErr) / t) ** 2);
    return { t, tErr, g, gErr, frames };
  }

  const api = { polyfit, velocities, analyzeFreeFall, dropG, solve };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.TP = root.TP || {}).physics = api;
})(typeof window !== 'undefined' ? window : globalThis);
