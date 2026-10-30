// Run with: node tests/run-tests.js
'use strict';
const assert = require('assert');
const physics = require('../js/physics.js');
const tracker = require('../js/tracker.js');
const demo = require('../js/demo.js');

let failures = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b} ± ${tol}, got ${a}`);

test('polyfit recovers an exact quadratic', () => {
  const t = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
  const y = t.map((v) => 2 - 1.5 * v - 4.9 * v * v);
  const f = physics.polyfit(t, y, 2);
  near(f.coef[0], 2, 1e-9, 'c0'); near(f.coef[1], -1.5, 1e-9, 'c1'); near(f.coef[2], -4.9, 1e-9, 'c2');
  near(f.r2, 1, 1e-12, 'r2');
});

test('analyzeFreeFall gives g and an uncertainty from noisy data', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const t = i / 60;
    pts.push({ t, x: 0.1 * t, y: 1.5 - 0.2 * t - 0.5 * 9.81 * t * t + rnd() * 0.004 });
  }
  const a = physics.analyzeFreeFall(pts);
  near(a.g, 9.81, 0.15, 'g');
  assert.ok(a.gErr > 0 && a.gErr < 0.2, 'gErr ' + a.gErr);
  near(a.gFromV, 9.81, 0.6, 'g from velocity');
  near(a.v0y, -0.2, 0.05, 'v0y');
});

// Render the demo clip once.
const bg = demo.renderBackground();
const frames = [];
for (let i = 0; i < demo.DEMO.frames; i++) {
  frames.push(demo.renderFrame(i, bg, { width: bg.width, height: bg.height, data: new Uint8ClampedArray(bg.data.length) }));
}

function track(method) {
  const start = demo.ballAt(0);
  const blob = tracker.estimateBlob(frames[0], start.x + 2, start.y - 1);
  const tpl = tracker.makeTemplate(frames[0], blob.x, blob.y, blob.r + 2);
  const hist = [{ frame: 0, x: blob.x, y: blob.y }];
  for (let i = 1; i < frames.length; i++) {
    const p = tracker.predict(hist, i);
    const searchR = Math.max(blob.r * 1.5, 12) + p.speed * 0.5;
    const m = method === 'template'
      ? tracker.matchTemplate(frames[i], tpl, p.x, p.y, searchR)
      : tracker.colorCentroid(frames[i], blob.color, 45, p.x, p.y, searchR);
    assert.ok(m, `lost at frame ${i}`);
    if (method === 'template') {
      assert.ok(m.score < 40, `poor match at frame ${i}: ${m.score}`);
      tracker.evolveTemplate(tpl, frames[i], m.x, m.y, 0.2);
    }
    hist.push({ frame: i, x: m.x, y: m.y });
  }
  return { blob, hist };
}

for (const method of ['template', 'color']) {
  test(`${method} tracking follows the demo ball and recovers g`, () => {
    const { blob, hist } = track(method);
    near(blob.r, demo.DEMO.ball.radius * demo.DEMO.pxPerMetre, 2, 'estimated radius');
    let maxErr = 0;
    for (const h of hist) {
      const truth = demo.ballAt(h.frame);
      // Pixel centres sit at +0.5 in the renderer.
      maxErr = Math.max(maxErr, Math.hypot(h.x + 0.5 - truth.x, h.y + 0.5 - truth.y));
    }
    assert.ok(maxErr < 1.5, 'max position error ' + maxErr.toFixed(2) + ' px');
    const s = 1 / demo.DEMO.pxPerMetre;
    const pts = hist.map((h) => ({ t: h.frame / demo.DEMO.fps, x: h.x * s, y: (demo.DEMO.floorY - h.y) * s }));
    const a = physics.analyzeFreeFall(pts);
    near(a.g, demo.DEMO.g, 0.1, 'g');
    console.log(`     g = ${a.g.toFixed(3)} ± ${a.gErr.toFixed(3)} m/s², max pos err ${maxErr.toFixed(2)} px`);
  });
}

test('three-frame differencing finds the moving ball', () => {
  const i = 20;
  const found = tracker.findMovingObject(frames[i - 3], frames[i], frames[i + 3]);
  assert.ok(found, 'nothing found');
  const truth = demo.ballAt(i);
  assert.ok(Math.hypot(found.x - truth.x, found.y - truth.y) < 6, `found at ${found.x},${found.y}, truth ${truth.x},${truth.y}`);
});

console.log(failures ? `\n${failures} test(s) failed` : '\nall tests passed');
process.exit(failures ? 1 : 0);
