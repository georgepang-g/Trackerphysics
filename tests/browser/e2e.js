/*
 * End-to-end browser test: import real video files and set points through the UI.
 *
 *   python3 tests/browser/make_clips.py /tmp/clips
 *   node tests/browser/e2e.js /tmp/clips
 *
 * Needs Playwright with Chromium. Every action goes through the page the way a student
 * would use it (file picker, drag and drop, dragging handles, clicking the ball, keys);
 * app state is only read to compare against the known true motion.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const CLIPS = path.resolve(process.argv[2] || '');
const truth = JSON.parse(fs.readFileSync(path.join(CLIPS, 'truth.json'), 'utf8'));
const G = 9.81;

let failures = 0;
const results = [];
function check(name, ok, detail) {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
  console.log(results[results.length - 1]);
}

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

(async () => {
  const server = await serve();
  const url = `http://localhost:${server.address().port}/index.html`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });

  const statusText = () => page.locator('#status').textContent();
  const waitStatus = (re, timeout = 60000) =>
    page.waitForFunction((src) => new RegExp(src).test(document.getElementById('status').textContent), re.source, { timeout });
  const readState = () => page.evaluate(() => {
    const s = TP.app.state;
    return { calib: s.calib, origin: s.origin, frame: s.frame, canvasW: stage.width, canvasH: stage.height,
      frames: s.source.frameCount, fileFps: s.fileFps, points: [...s.points].map(([f, p]) => [f, p.x, p.y]) };
  });

  // Map image pixels (of the working canvas) to screen coordinates.
  async function screen(x, y) {
    const box = await page.locator('#stage').boundingBox();
    const st = await readState();
    return [box.x + (x / st.canvasW) * box.width, box.y + (y / st.canvasH) * box.height];
  }
  async function drag(from, to) {
    await page.mouse.move(...(await screen(...from)));
    await page.mouse.down();
    await page.mouse.move(...(await screen(...to)), { steps: 6 });
    await page.mouse.up();
  }
  async function gotoFrame(n) {
    await page.evaluate((n) => { const s = document.getElementById('frameSlider'); s.value = n; s.dispatchEvent(new Event('input')); }, n);
    await page.waitForFunction((n) => document.getElementById('frameInput').value === String(n), n);
  }
  async function openWithPicker(file) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('label[for="fileInput"]')]);
    await chooser.setFiles(path.join(CLIPS, file));
    await waitStatus(/Opened|Could not|not a video/);
  }
  async function readG() {
    return page.evaluate(() => ({ g: parseFloat(gVal.textContent), err: gErr.textContent, n: +statN.textContent, r2: statR2.textContent }));
  }

  // Set the scale and origin by dragging the handles, then pick the ball just after release.
  async function setupAndTrack(c, scale, opts = {}) {
    const k = scale;
    const st = await readState();
    const [s0, s1] = c.stick.map(([x, y]) => [x * k, y * k]);
    await drag([st.calib.a.x, st.calib.a.y], [s0[0] - 20 * k, s0[1]]);
    await drag([st.calib.b.x, st.calib.b.y], [s1[0] - 20 * k, s1[1]]);
    const st2 = await readState();
    await drag([st2.origin.x, st2.origin.y], [c.floor[0] * k, c.floor[1] * k]);
    const after = await readState();
    const stickLen = Math.hypot(after.calib.b.x - after.calib.a.x, after.calib.b.y - after.calib.a.y);
    check(`${c.file}: scale stick dragged onto the metre stick`, Math.abs(stickLen - c.ppm * k) < 3,
      `${stickLen.toFixed(1)} px vs ${(c.ppm * k).toFixed(1)} px`);
    // Start tracking a couple of frames after release so the ball is clearly moving.
    const startF = c.release + 1;
    await gotoFrame(startF);
    await page.click('[data-tool="ball"]');
    const [tx, ty] = c.truth[startF];
    await page.mouse.click(...(await screen((tx + 3) * k, (ty - 2) * k)));   // a slightly off-centre click
    await waitStatus(/Tracked|Lost|Stopped/);
    const msg = await statusText();
    // Fit only the free fall: from the picked frame to the last frame before the floor.
    await gotoFrame(startF);
    await page.click('#btnSetStart');
    await gotoFrame(c.contact);
    await page.click('#btnSetEnd');
    const res = await readG();
    const fin = await readState();
    let maxErr = 0, used = 0;
    for (const [f, x, y] of fin.points) {
      if (f < startF || f > c.contact) continue;
      used++;
      const [X, Y] = c.truth[f];
      // Truth is in continuous coordinates of the clip (pixel centres at +0.5); the app uses
      // pixel indices on its working canvas. Error is in working-canvas pixels.
      maxErr = Math.max(maxErr, Math.hypot(x - (X * k - 0.5), y - (Y * k - 0.5)));
    }
    return { msg, res, maxErr, used, expected: c.contact - startF + 1 };
  }

  await page.goto(url);
  await waitStatus(/Tracked/, 30000);
  const demo = await readG();
  check('demo clip loads and tracks on start', Math.abs(demo.g - G) / G < 0.01, `g = ${demo.g}`);

  // --- Import each format with the file picker, set points, measure g ---
  const cases = [
    ['mp4', 'H.264 MP4, 1280×720, 60 fps'],
    ['mov', 'MOV with an audio track'],
    ['webm', 'VP9 WebM'],
    ['4k', '4K MP4 (scaled to 1920 wide)'],
    ['portrait', 'portrait phone clip with rotation metadata'],
  ];
  for (const [key, label] of cases) {
    const c = truth[key];
    await openWithPicker(c.file);
    const opened = await statusText();
    const st = await readState();
    check(`${label}: opens`, /Opened/.test(opened), opened.slice(0, 90));
    check(`${label}: frame rate detected`, Math.abs(st.fileFps - c.fps) < 0.5, `${st.fileFps} fps`);
    check(`${label}: frame count`, Math.abs(st.frames - c.frames) <= 1, `${st.frames} vs ${c.frames}`);
    const expectW = Math.min(1920, c.width);
    check(`${label}: picture size and orientation`, st.canvasW === expectW && Math.abs(st.canvasH - Math.round(c.height * expectW / c.width)) <= 1,
      `${st.canvasW}×${st.canvasH}`);
    const k = st.canvasW / c.width;
    const r = await setupAndTrack(c, k);
    check(`${label}: tracks every free-fall frame`, r.used === r.expected, `${r.used}/${r.expected} frames; ${r.msg.slice(0, 60)}`);
    check(`${label}: tracked positions match the true ball`, r.maxErr < 2, `max error ${r.maxErr.toFixed(2)} px`);
    check(`${label}: g within 2%`, Math.abs(r.res.g - G) / G < 0.02, `g = ${r.res.g} ${r.res.err} m/s², R² ${r.res.r2}`);
    if (key === 'mp4' || key === 'portrait') await page.screenshot({ path: path.join(CLIPS, 'shot-' + key + '.png') });
  }

  // --- Slow motion: 240 fps capture saved as a 30 fps file ---
  {
    const c = truth.slowmo;
    await openWithPicker(c.file);
    const st = await readState();
    check('slow-mo clip: detected as a 30 fps file', Math.abs(st.fileFps - 30) < 0.5, `${st.fileFps} fps`);
    await page.fill('#captureFps', '240');
    await page.press('#captureFps', 'Tab');
    const r = await setupAndTrack(c, st.canvasW / c.width);
    check('slow-mo clip: g within 2% after setting capture rate to 240', Math.abs(r.res.g - G) / G < 0.02,
      `g = ${r.res.g} ${r.res.err}, ${r.used} points`);
  }

  // --- Setting points by hand, editing them, and tracking on from them ---
  {
    const c = truth.mp4;
    await openWithPicker(c.file);
    const st = await readState();
    const k = st.canvasW / c.width;
    await setupAndTrack(c, k);              // sets scale/origin/range; clears below
    await page.click('#btnClear');
    let rows = await page.locator('#dataTable tbody tr[data-frame]').count();
    check('Clear track empties the table', rows === 0, `${rows} rows`);

    await gotoFrame(c.release + 1);
    await page.click('[data-tool="manual"]');
    for (let i = 0; i < 5; i++) {
      const f = c.release + 1 + i;
      await page.waitForFunction((f) => document.getElementById('frameInput').value === String(f), f);
      const [x, y] = c.truth[f];
      await page.mouse.click(...(await screen(x * k, y * k)));
    }
    await page.waitForFunction((f) => document.getElementById('frameInput').value === String(f), c.release + 6);
    rows = await page.locator('#dataTable tbody tr[data-frame]').count();
    check('Mark by hand: five clicks give five points and step the video', rows === 5, `${rows} rows, now on frame ${c.release + 6}`);
    const tableY = await page.$$eval('#dataTable tbody tr[data-frame]', (trs) => trs.map((tr) => [+tr.dataset.frame, +tr.cells[3].textContent]));
    const st2 = await readState();
    const ppm = Math.hypot(st2.calib.b.x - st2.calib.a.x, st2.calib.b.y - st2.calib.a.y);
    const worst = Math.max(...tableY.map(([f, y]) => Math.abs(y - (st2.origin.y - c.truth[f][1] * k) / ppm)));
    check('Mark by hand: heights in the table match where the ball is', worst < 2.5 / c.ppm, `worst ${(worst * 1000).toFixed(1)} mm`);

    // Press Track: it carries on automatically from the hand-marked points.
    await page.click('[data-tool="move"]');
    await page.click('#btnTrack');
    await waitStatus(/Tracked|Lost|Stopped/);
    rows = await page.locator('#dataTable tbody tr[data-frame]').count();
    const expectRows = c.contact - (c.release + 1) + 1;
    check('Track continues from hand-marked points', rows === expectRows, `${rows} rows (expected ${expectRows}): ${(await statusText()).slice(0, 50)}`);

    // Drag a point with Move.
    const f = c.release + 3;
    await gotoFrame(f);
    const before = (await readState()).points.find((p) => p[0] === f);
    await drag([before[1], before[2]], [before[1] + 25, before[2]]);
    const after = (await readState()).points.find((p) => p[0] === f);
    check('Move: dragging a point moves it', Math.abs(after[1] - before[1] - 25) < 1.5, `moved ${(after[1] - before[1]).toFixed(1)} px`);
    const xCell = await page.locator(`#dataTable tr[data-frame="${f}"] td`).nth(2).textContent();
    check('Move: the table updates', Math.abs(+xCell - (after[1] - st2.origin.x) / ppm) < 1e-3, `x = ${xCell} m`);

    await page.click('#btnDeletePoint');
    const gone = await page.locator(`#dataTable tr[data-frame="${f}"]`).count();
    check('Delete point removes it', gone === 0);

    // Keyboard and buttons step frames.
    const settle = async (n) => {
      await page.waitForFunction((n) => document.getElementById('frameInput').value === String(n), n, { timeout: 5000 }).catch(() => {});
      return (await readState()).frame;
    };
    await page.locator('h1').click();
    await page.keyboard.press('ArrowRight');
    let fr = await settle(f + 1);
    check('Right arrow steps one frame', fr === f + 1, `frame ${fr}`);
    await page.keyboard.press('Shift+ArrowLeft');
    fr = await settle(f - 9);
    check('Shift+Left steps back ten frames', fr === f - 9, `frame ${fr}`);
    await page.click('#btnNext');
    fr = await settle(f - 8);
    check('Next button steps forward', fr === f - 8, `frame ${fr}`);
    // Five quick presses without waiting must all count.
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    fr = await settle(f - 3);
    check('Quick repeated arrow presses all count', fr === f - 3, `frame ${fr}`);

    // Stop part-way, then Track carries on.
    await page.click('#btnClear');
    await gotoFrame(c.release + 1);
    await page.click('[data-tool="ball"]');
    const [bx, by] = c.truth[c.release + 1];
    await page.mouse.click(...(await screen(bx * k, by * k)));
    await page.click('#btnStop');
    await waitStatus(/Tracked|Stopped/);
    const stoppedMsg = await statusText();
    await page.click('#btnTrack');
    await waitStatus(/Tracked/);
    rows = await page.locator('#dataTable tbody tr[data-frame]').count();
    check('Stop, then Track carries on to the end frame', rows === expectRows, `${stoppedMsg.slice(0, 30)} → ${rows} rows`);
  }

  // --- Typing frame numbers ---
  {
    const c = truth.mp4;
    const last = c.frames - 1;
    await page.fill('#frameInput', '500');
    await page.press('#frameInput', 'Enter');
    await page.waitForFunction((f) => TP.app.state.frame === f, last, { timeout: 5000 }).catch(() => {});
    check('A frame number past the clip goes to the last frame', (await readState()).frame === last && (await page.inputValue('#frameInput')) === String(last),
      `frame ${(await readState()).frame}, box shows ${await page.inputValue('#frameInput')}`);
    await page.fill('#frameInput', '30');
    await page.waitForFunction(() => TP.app.state.frame === 30, null, { timeout: 5000 }).catch(() => {});
    let st = await readState();
    check('Typing a frame number jumps to that frame', st.frame === 30, `frame ${st.frame}`);
    check('Slider follows the typed frame', (await page.inputValue('#frameSlider')) === '30');

    await page.fill('#startInput', '20');
    await page.press('#startInput', 'Enter');
    await page.fill('#endInput', '40');
    await page.press('#endInput', 'Tab');
    const range = await page.evaluate(() => TP.app.state.range);
    const n = +(await page.locator('#statN').textContent());
    check('Typed start and end frames set the fit range', range.start === 20 && range.end === 40, `${range.start}–${range.end}`);
    check('The fit uses only the typed frames', n === 21, `${n} points`);
    const hollow = await page.locator('#dataTable tbody tr.is-out').count();
    const total = await page.locator('#dataTable tbody tr[data-frame]').count();
    check('Points outside the typed range are greyed out in the table', hollow === total - 21, `${hollow} of ${total}`);

    await page.fill('#endInput', '999');
    await page.press('#endInput', 'Enter');
    let r = await page.evaluate(() => TP.app.state.range);
    check('An end frame past the clip is clamped to the last frame', r.end === last && (await page.inputValue('#endInput')) === String(last), `end ${r.end}`);
    await page.fill('#endInput', '10');
    await page.press('#endInput', 'Enter');
    r = await page.evaluate(() => TP.app.state.range);
    check('An end before the start moves the start back to 0', r.start === 0 && r.end === 10, `${r.start}–${r.end}`);

    // Track only within a typed range: tracking stops at the typed end frame.
    await page.click('#btnClear');
    await page.fill('#startInput', String(c.release + 1));
    await page.press('#startInput', 'Enter');
    await page.fill('#endInput', String(c.release + 11));
    await page.press('#endInput', 'Enter');
    await page.fill('#frameInput', String(c.release + 1));
    await page.waitForFunction((f) => TP.app.state.frame === f, c.release + 1, { timeout: 5000 });
    await page.click('[data-tool="ball"]');
    const k = (await readState()).canvasW / c.width;
    await page.mouse.click(...(await screen(c.truth[c.release + 1][0] * k, c.truth[c.release + 1][1] * k)));
    await waitStatus(/Tracked|Lost|Stopped/);
    st = await readState();
    const frames = st.points.map((p) => p[0]);
    check('Tracking stops at the typed end frame', Math.max(...frames) === c.release + 11 && frames.length === 11,
      `frames ${Math.min(...frames)}–${Math.max(...frames)}, ${frames.length} points`);
  }

  // --- Drop-height method: type h, set release and landing frames; use the drop as the scale ---
  {
    const c = truth.mp4;
    await openWithPicker(c.file);
    const held = c.release - 1;          // last frame before the ball starts to fall
    const land = c.contact + 1;          // first frame touching the floor
    const h = (c.floor[1] - c.radius - c.truth[held][1]) / c.ppm;   // true distance the ball falls
    const k = (await readState()).canvasW / c.width;
    // Track first (scale stick left where it is, deliberately wrong) so the drop can set the scale.
    await page.fill('#frameInput', String(held));
    await page.waitForFunction((f) => TP.app.state.frame === f, held, { timeout: 5000 });
    await page.click('[data-tool="ball"]');
    await page.mouse.click(...(await screen(c.truth[held][0] * k, c.truth[held][1] * k)));
    await waitStatus(/Tracked|Lost|Stopped/);

    await page.fill('#dropH', h.toFixed(3));
    await page.fill('#dropRelease', String(held));
    await page.press('#dropRelease', 'Enter');
    await page.fill('#frameInput', String(land));
    await page.waitForFunction((f) => TP.app.state.frame === f, land, { timeout: 5000 });
    await page.click('#btnDropLand');
    const landBox = await page.inputValue('#dropLand');
    check('Drop: Use this frame sets the landing frame', landBox === String(land), `box shows ${landBox}`);
    const text = await page.locator('#dropG').textContent();
    const [gDrop, gDropErr] = text.match(/[\d.]+/g).map(Number);
    const tText = await page.locator('#dropT').textContent();
    check('Drop: fall time from the frames', tText.includes(`(${land - held} frames)`), tText);
    check('Drop: g = 2h/t² agrees with 9.81 within its uncertainty', Math.abs(gDrop - G) <= gDropErr,
      `h = ${h.toFixed(3)} m → g = ${gDrop} ± ${gDropErr}`);

    const before = (await readState()).calib;
    await page.click('#btnDropScale');
    const cal = (await readState()).calib;
    const px = Math.hypot(cal.b.x - cal.a.x, cal.b.y - cal.a.y);
    check('Drop: Use this drop as the scale moves the blue stick to the ball positions',
      Math.abs(cal.length - +h.toFixed(3)) < 1e-9 && Math.abs(px / cal.length - c.ppm * k) / (c.ppm * k) < 0.01,
      `${px.toFixed(1)} px for ${cal.length} m = ${(px / cal.length).toFixed(1)} px/m (true ${(c.ppm * k).toFixed(1)}); was ${Math.hypot(before.b.x - before.a.x, before.b.y - before.a.y).toFixed(0)} px`);
    await page.fill('#startInput', String(c.release)); await page.press('#startInput', 'Enter');
    await page.fill('#endInput', String(c.contact)); await page.press('#endInput', 'Enter');
    const res = await readG();
    check('Drop: tracked g is right with the scale taken from the drop', Math.abs(res.g - G) / G < 0.02, `g = ${res.g} ${res.err}`);

    await page.fill('#dropRelease', String(land + 2));
    await page.press('#dropRelease', 'Enter');
    check('Drop: landing before release gives a clear message',
      /must come after/.test(await page.locator('#dropNote').textContent()) && (await page.locator('#dropG').textContent()) === '—');
  }

  // --- Drag and drop a video onto the page ---
  {
    const bytes = fs.readFileSync(path.join(CLIPS, truth.webm.file)).toString('base64');
    await page.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bin], 'dropped.webm', { type: 'video/webm' }));
      const target = document.getElementById('stage');
      target.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, bytes);
    await waitStatus(/Opened|Could not/);
    const msg = await statusText();
    check('Drag and drop opens a video', /Opened dropped\.webm/.test(msg), msg.slice(0, 60));
    check('Drop overlay hides after the drop', await page.locator('#dropHint').isHidden());
  }

  // --- A file that is not a video ---
  await openWithPicker('notes.txt');
  const bad = await statusText();
  check('Non-video file gives a clear message', /not a video file/.test(bad), bad);

  check('No errors in the browser console', errors.length === 0, errors.join(' | '));
  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} check(s) failed` : `\nall ${results.length} checks passed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
