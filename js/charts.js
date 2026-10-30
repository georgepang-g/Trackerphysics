/*
 * charts.js — a small scatter-plus-fit chart drawn on canvas, themed from CSS tokens.
 */
(function (root) {
  'use strict';

  function niceStep(span, count) {
    const raw = span / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  }

  function ticks(min, max, count) {
    if (!(max > min)) { const pad = Math.abs(min) * 0.1 || 1; min -= pad; max += pad; }
    const step = niceStep(max - min, count);
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return { lo, hi, step, values: out };
  }

  const decimals = (step) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  class Chart {
    constructor(canvas, tip) {
      this.canvas = canvas;
      this.tip = tip;
      this.spec = { points: [] };
      this.hover = -1;
      canvas.addEventListener('pointermove', (e) => this.onMove(e));
      canvas.addEventListener('pointerleave', () => { this.hover = -1; this.tip.hidden = true; this.draw(); });
      canvas.addEventListener('click', () => {
        const p = this.spec.points[this.hover];
        if (p && this.spec.onPick) this.spec.onPick(p.frame);
      });
      new ResizeObserver(() => this.draw()).observe(canvas);
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.draw());
      new MutationObserver(() => this.draw()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    // spec: {points:[{x, y, frame, out}], fit(x)|null, xLabel, yLabel, xUnit, yUnit, current, onPick, empty}
    set(spec) { this.spec = spec; this.draw(); }

    layout() {
      const pts = this.spec.points.filter((p) => !p.out);
      const all = this.spec.points;
      const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
      if (this.spec.fit && pts.length) {
        const a = Math.min(...pts.map((p) => p.x)), b = Math.max(...pts.map((p) => p.x));
        for (let k = 0; k <= 20; k++) ys.push(this.spec.fit(a + ((b - a) * k) / 20));
      }
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      const m = { l: 62, r: 14, t: 12, b: 44 };
      const tx = ticks(Math.min(...xs), Math.max(...xs), Math.max(3, Math.floor((w - m.l - m.r) / 80)));
      const ty = ticks(Math.min(...ys), Math.max(...ys), Math.max(3, Math.floor((h - m.t - m.b) / 50)));
      const sx = (v) => m.l + ((v - tx.lo) / (tx.hi - tx.lo)) * (w - m.l - m.r);
      const sy = (v) => h - m.b - ((v - ty.lo) / (ty.hi - ty.lo)) * (h - m.t - m.b);
      return { w, h, m, tx, ty, sx, sy };
    }

    draw() {
      const c = this.canvas, dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      }
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const col = {
        ink: token('--ink'), muted: token('--muted'), line: token('--line'),
        point: token('--accent'), fit: token('--fit'), surface: token('--surface'), track: token('--ov-track'),
      };
      const font = (size, weight = 400) => `${weight} ${size}px ${token('--font-mono') || 'monospace'}`;
      const { points } = this.spec;
      if (!points.length) {
        ctx.fillStyle = col.muted;
        ctx.font = `14px ${token('--font-body')}`;
        ctx.textAlign = 'center';
        ctx.fillText(this.spec.empty || 'No tracked points yet', w / 2, h / 2);
        return;
      }
      const L = this.layout();
      this.L = L;
      const { m, tx, ty, sx, sy } = L;

      // Grid and tick labels
      ctx.lineWidth = 1;
      ctx.font = font(11);
      ctx.fillStyle = col.muted;
      ctx.strokeStyle = col.line;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (const v of ty.values) {
        const y = Math.round(sy(v)) + 0.5;
        ctx.globalAlpha = v === 0 ? 1 : 0.6;
        ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(v.toFixed(decimals(ty.step)), m.l - 8, y);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (const v of tx.values) {
        const x = Math.round(sx(v)) + 0.5;
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, h - m.b); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(v.toFixed(decimals(tx.step)), x, h - m.b + 6);
      }
      // Axis titles
      ctx.fillStyle = col.muted;
      ctx.font = `500 12px ${token('--font-body')}`;
      ctx.fillText(this.spec.xLabel, m.l + (w - m.l - m.r) / 2, h - 18);
      ctx.save();
      ctx.translate(14, m.t + (h - m.t - m.b) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'middle';
      ctx.fillText(this.spec.yLabel, 0, 0);
      ctx.restore();

      // Points: filled disks with a surface ring so they read over the fit line.
      points.forEach((p, i) => {
        const X = sx(p.x), Y = sy(p.y);
        const cur = p.frame === this.spec.current;
        const r = cur || i === this.hover ? 5.5 : points.length > 40 ? 3 : 4;
        ctx.beginPath(); ctx.arc(X, Y, r + 1.5, 0, 2 * Math.PI); ctx.fillStyle = col.surface; ctx.fill();
        ctx.beginPath(); ctx.arc(X, Y, r, 0, 2 * Math.PI);
        if (p.out) { ctx.strokeStyle = col.muted; ctx.lineWidth = 1.5; ctx.stroke(); }
        else { ctx.fillStyle = cur ? col.track : col.point; ctx.fill(); }
      });
      // Fit curve on top of the points so it stays visible through dense data.
      const used = points.filter((p) => !p.out);
      if (this.spec.fit && used.length > 1) {
        const a = Math.min(...used.map((p) => p.x)), b = Math.max(...used.map((p) => p.x));
        ctx.strokeStyle = col.fit; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k <= 80; k++) {
          const xv = a + ((b - a) * k) / 80;
          const X = sx(xv), Y = sy(this.spec.fit(xv));
          k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
        ctx.stroke();
      }

    }

    onMove(e) {
      const pts = this.spec.points;
      if (!pts.length || !this.L) return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let best = -1, bd = 24 * 24;
      pts.forEach((p, i) => {
        const d = (this.L.sx(p.x) - mx) ** 2 + (this.L.sy(p.y) - my) ** 2 * 0.25;
        if (d < bd) { bd = d; best = i; }
      });
      if (best !== this.hover) { this.hover = best; this.draw(); }
      this.canvas.style.cursor = best >= 0 ? 'pointer' : 'default';
      if (best < 0) { this.tip.hidden = true; return; }
      const p = pts[best];
      this.tip.innerHTML = `frame ${p.frame}${p.out ? ' (not in fit)' : ''}<br>${this.spec.xName} = ${p.x.toFixed(4)} ${this.spec.xUnit}<br>${this.spec.yName} = ${p.y.toFixed(4)} ${this.spec.yUnit}`;
      this.tip.hidden = false;
      const X = this.L.sx(p.x) + 8, Y = this.L.sy(p.y);
      const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
      this.tip.style.left = Math.min(X + 8, this.L.w - tw) + 'px';
      this.tip.style.top = Math.max(0, Y - th - 8) + 'px';
    }
  }

  (root.TP = root.TP || {}).Chart = Chart;
})(window);
