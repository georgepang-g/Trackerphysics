/*
 * app.js — the TrackerPhysics user interface: video frames, scale and axes,
 * automatic tracking, graphs, data table and the g result.
 */
(function () {
  'use strict';
  const { physics, tracker, demo, Chart } = window.TP;
  const $ = (id) => document.getElementById(id);

  const stage = $('stage');
  const sctx = stage.getContext('2d');
  const frameCanvas = document.createElement('canvas');
  const fctx = frameCanvas.getContext('2d', { willReadFrequently: true });
  const chart = new Chart($('chart'), $('chartTip'));
  const MAX_WIDTH = 1920;

  const state = {
    source: null,
    frame: 0,
    img: null,
    fileFps: 120,
    captureFps: 120,
    step: 1,
    calib: { a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, length: 1 },
    origin: { x: 0, y: 0 },
    points: new Map(),        // frame -> {x, y, manual} in image pixels
    range: { start: 0, end: 0 },
    tool: 'move',
    method: 'template',
    ballR: 12,
    tolerance: 40,
    evolve: 0.2,
    template: null,
    color: null,
    tracking: false,
    stop: false,
    search: null,             // last search window, drawn while tracking
    chart: 'y',
    gRef: 9.81,
    drag: null,
    mouse: null,
    analysis: null,
  };

  // ---------- status ----------
  function status(msg, kind) {
    const el = $('status');
    el.textContent = msg;
    el.className = 'status' + (kind ? ' is-' + kind : '');
  }

  // ---------- frame sources ----------
  function once(target, ev, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error(ev + ' timed out')); }, timeout);
      const ok = () => { cleanup(); resolve(); };
      const bad = () => { cleanup(); reject(new Error('The browser could not decode this video.')); };
      function cleanup() { clearTimeout(timer); target.removeEventListener(ev, ok); target.removeEventListener('error', bad); }
      target.addEventListener(ev, ok);
      target.addEventListener('error', bad);
    });
  }

  async function makeDemoSource() {
    const D = demo.DEMO;
    try { await document.fonts.ready; } catch (e) { /* fall back to system fonts */ }
    const bg = demo.renderBackground();
    const c = document.createElement('canvas');
    c.width = D.width; c.height = D.height;
    const x = c.getContext('2d');
    x.putImageData(new ImageData(bg.data, D.width, D.height), 0, 0);
    x.fillStyle = '#26323b';
    x.font = '600 15px "IBM Plex Sans Condensed", sans-serif';
    for (let cm = 0; cm <= 100; cm += 20) {
      x.fillText(cm + ' cm', D.stick.x + 14, D.floorY - cm * D.pxPerMetre / 100 + 5);
    }
    const base = x.getImageData(0, 0, D.width, D.height);
    return {
      kind: 'demo',
      label: 'DEMO · synthetic 120 fps clip',
      width: D.width,
      height: D.height,
      duration: D.frames / D.fps,
      fps: D.fps,
      frameCount: D.frames,
      async getFrame(i) {
        return demo.renderFrame(i, base, new ImageData(D.width, D.height));
      },
      setFps() {},
      preset: {
        calib: { a: { x: D.stick.x - 34, y: D.floorY }, b: { x: D.stick.x - 34, y: D.floorY - D.pxPerMetre }, length: 1 },
        origin: { x: D.stick.x, y: D.floorY },
      },
    };
  }

  async function makeVideoSource(file) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    // Chrome only decodes seeked frames reliably for a video that is in the document.
    video.className = 'decoder';
    document.body.appendChild(video);
    const url = URL.createObjectURL(file);
    video.src = url;
    await once(video, 'loadeddata');
    if (!isFinite(video.duration)) {
      // Some recordings (e.g. WebM from MediaRecorder) report no duration until the end is reached.
      video.currentTime = 1e7;
      await once(video, 'seeked').catch(() => {});
      video.currentTime = 0;
      await once(video, 'seeked').catch(() => {});
    }
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
    const width = Math.round(video.videoWidth * scale), height = Math.round(video.videoHeight * scale);
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const cx = c.getContext('2d', { willReadFrequently: true });
    let chain = Promise.resolve();

    const src = {
      kind: 'video',
      label: file.name,
      url, video, width, height,
      duration: video.duration,
      fps: 30,
      frameCount: 1,
      setFps(fps) {
        this.fps = fps;
        this.frameCount = Math.max(1, Math.floor(this.duration * fps + 1e-6));
      },
      getFrame(i) {
        const p = chain.then(async () => {
          const t = Math.min((i + 0.5) / this.fps, Math.max(0, this.duration - 0.0005));
          if (Math.abs(video.currentTime - t) > 1e-5) {
            const seeked = once(video, 'seeked', 5000);
            // `seeked` can fire before the new frame is decoded; wait for it to be presented too.
            const presented = video.requestVideoFrameCallback
              ? new Promise((resolve) => { video.requestVideoFrameCallback(() => resolve()); setTimeout(resolve, 300); })
              : null;
            video.currentTime = t;
            await seeked;
            if (presented) await presented;
          }
          cx.drawImage(video, 0, 0, width, height);
          return cx.getImageData(0, 0, width, height);
        });
        chain = p.catch(() => {});
        return p;
      },
      dispose() { URL.revokeObjectURL(url); video.removeAttribute('src'); video.load(); video.remove(); },
    };
    src.setFps(30);
    return src;
  }

  // Play part of the clip and read the frame timestamps the browser reports.
  async function detectFps(video) {
    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return null;
    const times = [];
    const fps = await new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        video.pause();
        // Timestamps may be rounded (e.g. to whole ms) and playback may skip frames, so take a
        // short typical gap, count how many frames each gap spans, and divide by the whole span.
        const d = [];
        for (let i = 1; i < times.length; i++) if (times[i] > times[i - 1]) d.push(times[i] - times[i - 1]);
        if (d.length < 4) { resolve(null); return; }
        const unit = d.slice().sort((a, b) => a - b)[Math.floor(d.length * 0.2)];
        const frames = d.reduce((n, gap) => n + Math.max(1, Math.round(gap / unit)), 0);
        resolve(frames / d.reduce((s, gap) => s + gap, 0));
      };
      const onFrame = (now, meta) => {
        times.push(meta.mediaTime);
        if (times.length < 30 && !finished) video.requestVideoFrameCallback(onFrame);
        else finish();
      };
      video.currentTime = 0;
      video.playbackRate = 0.5;
      video.requestVideoFrameCallback(onFrame);
      video.play().catch(finish);
      setTimeout(finish, 4000);
    });
    video.playbackRate = 1;
    if (!fps) return null;
    const common = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 100, 119.88, 120, 240, 480, 960];
    // Prefer a whole-number rate when the measurement can't tell it from the NTSC rate beside it.
    const whole = common.find((c) => Number.isInteger(c) && Math.abs(c - fps) / c < 0.002);
    if (whole) return whole;
    const snap = common.reduce((best, c) => (Math.abs(c - fps) < Math.abs(best - fps) ? c : best));
    return Math.abs(snap - fps) / snap < 0.02 ? snap : Math.round(fps * 100) / 100;
  }

  // ---------- loading ----------
  async function useSource(src) {
    if (state.source && state.source.dispose) state.source.dispose();
    state.source = src;
    state.points.clear();
    state.template = null;
    state.frame = 0;
    stage.width = frameCanvas.width = src.width;
    stage.height = frameCanvas.height = src.height;
    if (src.preset) {
      state.calib = JSON.parse(JSON.stringify(src.preset.calib));
      state.origin = { ...src.preset.origin };
    } else {
      const W = src.width, H = src.height;
      state.calib = { a: { x: W * 0.12, y: H * 0.8 }, b: { x: W * 0.12, y: H * 0.3 }, length: 1 };
      state.origin = { x: W * 0.5, y: H * 0.9 };
    }
    $('calLength').value = state.calib.length.toFixed(3);
    setFps(src.fps, src.fps);
    $('sourceBadge').textContent = src.label;
    await showFrame(0);
  }

  function setFps(fileFps, captureFps) {
    state.fileFps = fileFps;
    if (captureFps) state.captureFps = captureFps;
    $('fileFps').value = +state.fileFps.toFixed(3);
    $('captureFps').value = +state.captureFps.toFixed(3);
    if (state.source) state.source.setFps(fileFps);
    const n = state.source ? state.source.frameCount : 1;
    $('frameSlider').max = n - 1;
    state.range = { start: 0, end: n - 1 };
    if (state.frame > n - 1) state.frame = n - 1;
    updateFrameUI();
  }

  async function openFile(file) {
    if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|ogv|avi|mkv)$/i.test(file.name)) {
      status(`${file.name} is not a video file. Choose an MP4, MOV or WebM clip.`, 'warn');
      return;
    }
    stopTracking();
    status('Opening ' + file.name + '…');
    try {
      const src = await makeVideoSource(file);
      await useSource(src);
      status('Measuring the frame rate…');
      const fps = await detectFps(src.video);
      setFps(fps || 30, fps || 30);
      await showFrame(0);
      status(fps
        ? `Opened ${file.name}: ${src.frameCount} frames at ${fps} fps. Set the scale and origin, then click Pick ball and click the ball.`
        : `Opened ${file.name}. The frame rate could not be read, so 30 fps is assumed. Check it in step 1.`,
        fps ? null : 'warn');
    } catch (err) {
      status(`Could not open ${file.name}. ${err.message} Try converting it to MP4 (H.264).`, 'warn');
    }
    updateAnalysis();
  }

  async function loadDemo() {
    stopTracking();
    await useSource(await makeDemoSource());
    status('Demo clip loaded. Finding the moving ball…');
    await autoFind();
  }

  // ---------- frames ----------
  let loadingFrame = null, wantedFrame = null;
  async function showFrame(i) {
    if (!state.source) return;
    i = Math.max(0, Math.min(state.source.frameCount - 1, Math.round(i)));
    wantedFrame = i;
    if (loadingFrame !== null) return;
    while (wantedFrame !== null) {
      const f = wantedFrame;
      wantedFrame = null;
      loadingFrame = f;
      try {
        const img = await state.source.getFrame(f);
        setFrameImage(f, img);
      } catch (err) {
        status('Could not read frame ' + f + '. ' + err.message, 'warn');
      }
      loadingFrame = null;
    }
  }

  function setFrameImage(f, img) {
    state.frame = f;
    state.img = img;
    fctx.putImageData(img, 0, 0);
    render();
    updateFrameUI();
    highlightCurrent();
  }

  function frameTime(f) { return f / state.captureFps; }

  function updateFrameUI() {
    const n = state.source ? state.source.frameCount : 1;
    $('frameSlider').value = state.frame;
    $('frameRead').textContent = `frame ${state.frame} / ${n - 1} · t = ${frameTime(state.frame).toFixed(3)} s`;
    $('rangeRead').textContent = `fit frames ${state.range.start}–${state.range.end}`;
    const span = Math.max(1, n - 1);
    const fill = $('rangeFill');
    fill.style.left = (state.range.start / span) * 100 + '%';
    fill.style.width = ((state.range.end - state.range.start) / span) * 100 + '%';
  }

  // ---------- geometry ----------
  const ppm = () => Math.hypot(state.calib.b.x - state.calib.a.x, state.calib.b.y - state.calib.a.y) / state.calib.length;
  const toWorld = (p) => ({ x: (p.x - state.origin.x) / ppm(), y: (state.origin.y - p.y) / ppm() });
  const inRange = (f) => f >= state.range.start && f <= state.range.end;

  function toImage(e) {
    const r = stage.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * stage.width, y: ((e.clientY - r.top) / r.height) * stage.height };
  }
  const pxPerCss = () => stage.width / Math.max(1, stage.getBoundingClientRect().width);

  // ---------- drawing the stage ----------
  function render() {
    if (!state.source) return;
    const k = pxPerCss();
    const css = getComputedStyle(document.documentElement);
    const C = (n) => css.getPropertyValue(n).trim();
    const col = { scale: C('--ov-scale'), axes: C('--ov-axes'), track: C('--ov-track'), halo: C('--ov-halo') };
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.drawImage(frameCanvas, 0, 0);
    sctx.lineCap = 'round';

    const haloLine = (draw, color, w) => {
      sctx.strokeStyle = 'rgba(0,0,0,0.55)'; sctx.lineWidth = (w + 2.5) * k; draw(); sctx.stroke();
      sctx.strokeStyle = color; sctx.lineWidth = w * k; draw(); sctx.stroke();
    };
    const label = (text, x, y, color) => {
      sctx.font = `500 ${13 * k}px "IBM Plex Mono", monospace`;
      const w = sctx.measureText(text).width;
      sctx.fillStyle = 'rgba(11,17,22,0.78)';
      sctx.fillRect(x - 4 * k, y - 11 * k, w + 8 * k, 16 * k);
      sctx.fillStyle = color;
      sctx.fillText(text, x, y + 1 * k);
    };
    const handle = (p, color) => {
      sctx.beginPath(); sctx.arc(p.x, p.y, 6 * k, 0, 2 * Math.PI);
      sctx.fillStyle = 'rgba(11,17,22,0.35)'; sctx.fill();
      sctx.lineWidth = 2 * k; sctx.strokeStyle = color; sctx.stroke();
    };

    // Axes through the origin
    const o = state.origin;
    sctx.save();
    sctx.globalAlpha = 0.45;
    haloLine(() => { sctx.beginPath(); sctx.moveTo(0, o.y); sctx.lineTo(stage.width, o.y); sctx.moveTo(o.x, 0); sctx.lineTo(o.x, stage.height); }, col.axes, 1);
    sctx.restore();
    const arm = 54 * k;
    haloLine(() => {
      sctx.beginPath();
      sctx.moveTo(o.x, o.y); sctx.lineTo(o.x + arm, o.y);
      sctx.moveTo(o.x + arm - 7 * k, o.y - 5 * k); sctx.lineTo(o.x + arm, o.y); sctx.lineTo(o.x + arm - 7 * k, o.y + 5 * k);
      sctx.moveTo(o.x, o.y); sctx.lineTo(o.x, o.y - arm);
      sctx.moveTo(o.x - 5 * k, o.y - arm + 7 * k); sctx.lineTo(o.x, o.y - arm); sctx.lineTo(o.x + 5 * k, o.y - arm + 7 * k);
    }, col.axes, 2.5);
    label('x', o.x + arm + 6 * k, o.y + 4 * k, col.axes);
    label('y', o.x + 8 * k, o.y - arm, col.axes);
    handle(o, col.axes);

    // Calibration stick
    const { a, b } = state.calib;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    haloLine(() => {
      sctx.beginPath();
      sctx.moveTo(a.x, a.y); sctx.lineTo(b.x, b.y);
      for (const p of [a, b]) { sctx.moveTo(p.x - nx * 9 * k, p.y - ny * 9 * k); sctx.lineTo(p.x + nx * 9 * k, p.y + ny * 9 * k); }
    }, col.scale, 2.5);
    handle(a, col.scale); handle(b, col.scale);
    label(`${state.calib.length.toFixed(3)} m`, (a.x + b.x) / 2 + 14 * k, (a.y + b.y) / 2, '#cfe0ff');

    // Track points
    const frames = [...state.points.keys()].sort((p, q) => p - q);
    for (const f of frames) {
      const p = state.points.get(f);
      sctx.beginPath(); sctx.arc(p.x, p.y, 3.2 * k, 0, 2 * Math.PI);
      sctx.fillStyle = inRange(f) ? col.track : 'rgba(200,200,200,0.8)';
      sctx.fill();
      sctx.lineWidth = 1.2 * k; sctx.strokeStyle = col.halo; sctx.stroke();
    }
    const cur = state.points.get(state.frame);
    if (cur) {
      sctx.beginPath(); sctx.arc(cur.x, cur.y, state.ballR + 3 * k, 0, 2 * Math.PI);
      sctx.lineWidth = 2 * k; sctx.strokeStyle = col.track; sctx.stroke();
      const w = toWorld(cur);
      label(`x ${w.x.toFixed(3)}  y ${w.y.toFixed(3)} m`, cur.x + state.ballR + 8 * k, cur.y - state.ballR, '#ffd1e4');
    }
    if (state.tracking && state.search) {
      const s = state.search;
      sctx.setLineDash([6 * k, 5 * k]);
      sctx.lineWidth = 1.2 * k; sctx.strokeStyle = col.halo;
      sctx.strokeRect(s.x - s.r, s.y - s.r, 2 * s.r, 2 * s.r);
      sctx.setLineDash([]);
    }
    // Pick-ball cursor
    if (state.mouse && (state.tool === 'ball' || state.tool === 'manual') && !state.tracking) {
      const m = state.mouse;
      sctx.beginPath(); sctx.arc(m.x, m.y, state.ballR, 0, 2 * Math.PI);
      sctx.moveTo(m.x - 5 * k, m.y); sctx.lineTo(m.x + 5 * k, m.y); sctx.moveTo(m.x, m.y - 5 * k); sctx.lineTo(m.x, m.y + 5 * k);
      sctx.lineWidth = 1.5 * k; sctx.strokeStyle = col.track; sctx.stroke();
    }
  }

  // ---------- pointer interaction ----------
  function hitHandle(p) {
    const r = 12 * pxPerCss();
    const near = (q) => Math.hypot(q.x - p.x, q.y - p.y) < r;
    if (near(state.calib.a)) return { kind: 'a' };
    if (near(state.calib.b)) return { kind: 'b' };
    if (near(state.origin)) return { kind: 'origin' };
    if (state.tool === 'move') {
      const cur = state.points.get(state.frame);
      if (cur && near(cur)) return { kind: 'point' };
      // Grab the stick by its body to move it whole.
      const { a, b } = state.calib;
      const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (L2 || 1)));
      if (Math.hypot(a.x + t * (b.x - a.x) - p.x, a.y + t * (b.y - a.y) - p.y) < 7 * pxPerCss()) {
        return { kind: 'stick', from: p, a0: { ...a }, b0: { ...b } };
      }
    }
    return null;
  }

  stage.addEventListener('pointerdown', (e) => {
    if (!state.source || state.tracking) return;
    const p = toImage(e);
    const h = hitHandle(p);
    if (h) {
      state.drag = h;
      stage.setPointerCapture(e.pointerId);
      $('stageWrap').classList.add('dragging');
      return;
    }
    if (state.tool === 'ball') pickBall(p);
    else if (state.tool === 'manual') markByHand(p);
  });

  stage.addEventListener('pointermove', (e) => {
    if (!state.source) return;
    const p = toImage(e);
    state.mouse = p;
    const d = state.drag;
    if (d) {
      if (d.kind === 'a' || d.kind === 'b') state.calib[d.kind] = p;
      else if (d.kind === 'origin') state.origin = p;
      else if (d.kind === 'point') state.points.set(state.frame, { x: p.x, y: p.y, manual: true });
      else if (d.kind === 'stick') {
        const dx = p.x - d.from.x, dy = p.y - d.from.y;
        state.calib.a = { x: d.a0.x + dx, y: d.a0.y + dy };
        state.calib.b = { x: d.b0.x + dx, y: d.b0.y + dy };
      }
      scheduleAnalysis();
    } else {
      stage.style.cursor = hitHandle(p) ? 'grab' : '';
    }
    requestRender();
  });

  const endDrag = () => {
    if (!state.drag) return;
    state.drag = null;
    $('stageWrap').classList.remove('dragging');
    updateAnalysis();
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('pointerleave', () => { state.mouse = null; requestRender(); });

  let renderQueued = false;
  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  function setTool(tool) {
    state.tool = tool;
    document.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    $('stageWrap').className = 'stage tool-' + tool;
    if (tool === 'ball') status('Click the centre of the ball. Tracking starts from this frame.');
    if (tool === 'manual') status('Click the ball on each frame. The video steps forward after every click.');
    requestRender();
  }

  // ---------- tracking ----------
  function seed(frame, x, y) {
    const img = state.img;
    state.template = tracker.makeTemplate(img, x, y, state.ballR + 2);
    state.color = tracker.meanColor(img, x, y, Math.max(1, Math.round(state.ballR * 0.6)));
    state.points.set(frame, { x, y });
    if (frame < state.range.start) state.range.start = frame;
    if (frame > state.range.end) state.range.end = frame;
  }

  function pickBall(p) {
    const blob = tracker.estimateBlob(state.img, p.x, p.y, Math.min(150, stage.width / 4));
    let { x, y } = blob;
    if (blob.r >= 2 && blob.r <= 150 && Math.hypot(blob.x - p.x, blob.y - p.y) < blob.r * 1.5) {
      state.ballR = Math.round(blob.r);
      $('ballR').value = state.ballR;
    } else {
      x = p.x; y = p.y;
    }
    seed(state.frame, x, y);
    setTool('move');
    startTracking();
  }

  function markByHand(p) {
    state.points.set(state.frame, { x: p.x, y: p.y, manual: true });
    updateAnalysis();
    const next = state.frame + state.step;
    if (state.source && next < state.source.frameCount) showFrame(next); else render();
  }

  async function autoFind() {
    const src = state.source;
    if (!src || src.frameCount < 3) return;
    const d = Math.max(1, Math.round(state.fileFps / 40));
    const f = state.frame;
    const fa = f - d >= 0 ? f - d : Math.min(src.frameCount - 1, f + 2 * d);
    const fb = f + d < src.frameCount ? f + d : Math.max(0, f - 2 * d);
    status('Looking for a moving ball…');
    const prev = await src.getFrame(fa);
    const next = await src.getFrame(fb);
    const cur = await src.getFrame(f);
    setFrameImage(f, cur);
    const found = tracker.findMovingObject(prev, cur, next);
    if (!found) {
      status('No moving object found on this frame. Step to a frame where the ball is moving, or use Pick ball.', 'warn');
      return;
    }
    const blob = tracker.estimateBlob(cur, found.x, found.y, Math.max(20, found.r * 2.5));
    const good = blob.r >= 2 && Math.abs(blob.r - found.r) < Math.max(4, found.r);
    state.ballR = Math.max(3, Math.round(good ? blob.r : found.r));
    $('ballR').value = state.ballR;
    seed(f, good ? blob.x : found.x, good ? blob.y : found.y);
    await startTracking();
  }

  function stopTracking() { if (state.tracking) state.stop = true; }

  async function startTracking() {
    const src = state.source;
    if (!src || state.tracking) return;
    // Start from the latest tracked point at or before the current frame.
    const known = [...state.points.keys()].filter((f) => f <= state.frame).sort((p, q) => p - q);
    if (!known.length) { status('Choose Pick ball, then click the ball to start tracking.', 'warn'); return; }
    let f = known[known.length - 1];
    if (!state.template) {
      // The points were marked by hand: learn the ball's size and look from the latest one.
      const p = state.points.get(f);
      const img = f === state.frame ? state.img : await src.getFrame(f);
      const blob = tracker.estimateBlob(img, p.x, p.y, Math.min(150, img.width / 4));
      if (blob.r >= 2 && blob.r <= 150 && Math.hypot(blob.x - p.x, blob.y - p.y) < blob.r) {
        state.ballR = Math.round(blob.r);
        $('ballR').value = state.ballR;
      }
      state.template = tracker.makeTemplate(img, p.x, p.y, state.ballR + 2);
      state.color = tracker.meanColor(img, p.x, p.y, Math.max(1, Math.round(state.ballR * 0.6)));
    }
    const hist = known.slice(-3).map((k) => ({ frame: k, ...state.points.get(k) }));

    state.tracking = true;
    state.stop = false;
    setTrackingUI(true);
    status(`Tracking from frame ${f}…`);
    let lostAt = null, count = 0;
    const end = Math.min(state.range.end, src.frameCount - 1);
    try {
      while (!state.stop) {
        const next = f + state.step;
        if (next > end) break;
        const img = await src.getFrame(next);
        const pr = tracker.predict(hist, next);
        const r = state.ballR;
        const searchR = hist.length < 2 ? Math.max(4 * r, 40) : Math.max(1.5 * r, 12) + pr.speed * 0.5;
        state.search = { x: pr.x, y: pr.y, r: searchR };
        if (pr.x < -r || pr.y < -r || pr.x > img.width + r || pr.y > img.height + r) { lostAt = next; setFrameImage(next, img); break; }
        let m;
        if (state.method === 'template') {
          m = tracker.matchTemplate(img, state.template, pr.x, pr.y, searchR);
          if (m.score > state.tolerance) m = null;
        } else {
          m = tracker.colorCentroid(img, state.color, state.tolerance, pr.x, pr.y, searchR);
        }
        if (!m) { lostAt = next; setFrameImage(next, img); break; }
        state.points.set(next, { x: m.x, y: m.y });
        if (state.method === 'template') tracker.evolveTemplate(state.template, img, m.x, m.y, state.evolve);
        hist.push({ frame: next, x: m.x, y: m.y });
        if (hist.length > 3) hist.shift();
        f = next;
        count++;
        setFrameImage(next, img);
        scheduleAnalysis();
        if (count % 4 === 0) await new Promise((res) => setTimeout(res, 0));
      }
    } catch (err) {
      status('Tracking stopped: ' + err.message, 'warn');
    }
    state.tracking = false;
    state.search = null;
    setTrackingUI(false);
    updateAnalysis();
    render();
    if (lostAt !== null) {
      status(`Lost the ball at frame ${lostAt}. Click Pick ball and click the ball here to carry on, or Set end to stop the fit before this frame.`, 'warn');
    } else if (state.stop) {
      status(`Stopped at frame ${f}. Press Track to continue.`);
    } else {
      const a = state.analysis;
      status(`Tracked ${count} frames.` + (a ? ` g = ${a.g.toFixed(3)} m/s².` : ''), 'good');
    }
  }

  function setTrackingUI(on) {
    $('btnStop').disabled = !on;
    for (const id of ['btnTrack', 'btnAutoFind', 'btnDemo', 'btnClear', 'btnDeletePoint', 'btnDetectFps']) $(id).disabled = on;
  }

  // ---------- analysis ----------
  function trackedRows() {
    const frames = [...state.points.keys()].sort((p, q) => p - q);
    const used = frames.filter(inRange);
    const t0 = used.length ? used[0] : frames[0] || 0;
    const rows = frames.map((f) => {
      const w = toWorld(state.points.get(f));
      return { frame: f, t: (f - t0) / state.captureFps, x: w.x, y: w.y, out: !inRange(f), vy: null };
    });
    for (let i = 1; i < rows.length - 1; i++) {
      rows[i].vy = (rows[i + 1].y - rows[i - 1].y) / (rows[i + 1].t - rows[i - 1].t);
    }
    return rows;
  }

  let analysisQueued = false;
  function scheduleAnalysis() {
    if (analysisQueued) return;
    analysisQueued = true;
    requestAnimationFrame(() => { analysisQueued = false; updateAnalysis(); });
  }

  const fmtSigned = (v, d) => (v < 0 ? '− ' : '+ ') + Math.abs(v).toFixed(d);

  function updateAnalysis() {
    const rows = trackedRows();
    const used = rows.filter((r) => !r.out);
    const a = used.length >= 4 && ppm() > 0 ? physics.analyzeFreeFall(used) : null;
    state.analysis = a;
    $('scaleRead').textContent = `${ppm().toFixed(1)} px per metre · 1 px = ${(1000 / ppm()).toFixed(2)} mm`;

    const pill = $('gPill');
    if (!a || !isFinite(a.g)) {
      $('gVal').textContent = '—';
      $('gErr').textContent = '';
      pill.className = 'pill';
      pill.textContent = 'no data';
      $('gCompareText').textContent = used.length ? `Need at least 4 points in the fit range (have ${used.length}).` : 'Track the ball to measure g.';
      for (const id of ['statGV', 'statR2', 'statN', 'statDrop', 'statDur', 'statY0']) $(id).textContent = '—';
      $('fitEq').textContent = '';
    } else {
      const dec = isFinite(a.gErr) && a.gErr > 0 ? Math.min(3, Math.max(2, 1 - Math.floor(Math.log10(a.gErr)))) : 2;
      $('gVal').textContent = a.g.toFixed(dec);
      $('gErr').textContent = isFinite(a.gErr) ? '± ' + a.gErr.toFixed(dec) : '';
      const pct = ((a.g - state.gRef) / state.gRef) * 100;
      const abs = Math.abs(pct);
      pill.className = 'pill ' + (abs < 2 ? 'good' : abs < 5 ? 'warn' : 'bad');
      pill.textContent = (pct >= 0 ? '+' : '−') + abs.toFixed(abs < 1 ? 2 : 1) + '%';
      $('gCompareText').textContent = `vs accepted ${state.gRef} m/s² (${abs < 2 ? 'close' : abs < 5 ? 'check setup' : 'far off: check scale and frame rate'})`;
      $('statGV').textContent = isFinite(a.gFromV) ? `${a.gFromV.toFixed(2)} ± ${a.gFromVErr.toFixed(2)}` : '—';
      $('statR2').textContent = a.fitY.r2.toFixed(5);
      $('statN').textContent = a.n;
      $('statDrop').textContent = a.drop.toFixed(3) + ' m';
      $('statDur').textContent = a.duration.toFixed(3) + ' s';
      $('statY0').textContent = a.y0.toFixed(3) + ' m';
      const c = a.fitY.coef;
      $('fitEq').textContent = `fit: y(t) = ${c[0].toFixed(3)} ${fmtSigned(c[1], 3)}·t ${fmtSigned(c[2], 3)}·t²   (½g = ${(-c[2]).toFixed(3)})`;
    }
    drawChart(rows, a);
    drawTable(rows);
    updateFrameUI();
  }

  function drawChart(rows, a) {
    const which = state.chart;
    const legend = $('chartLegend');
    const fitName = { y: 'quadratic fit', vy: 'linear fit', x: 'linear fit' }[which];
    legend.innerHTML = `<span><i class="lg-dot"></i>tracked points</span>` + (a ? `<span><i class="lg-line"></i>${fitName}</span>` : '');
    const base = { current: state.frame, onPick: (f) => showFrame(f), xLabel: 't (s)', xName: 't', xUnit: 's' };
    if (which === 'y') {
      chart.set({ ...base, points: rows.map((r) => ({ x: r.t, y: r.y, frame: r.frame, out: r.out })),
        fit: a ? a.fitY.eval : null, yLabel: 'y (m)', yName: 'y', yUnit: 'm', empty: 'Track the ball to plot height against time' });
    } else if (which === 'vy') {
      chart.set({ ...base, points: rows.filter((r) => r.vy !== null).map((r) => ({ x: r.t, y: r.vy, frame: r.frame, out: r.out })),
        fit: a && a.fitV ? a.fitV.eval : null, yLabel: 'vy (m/s)', yName: 'vy', yUnit: 'm/s', empty: 'Velocity needs at least 3 tracked points' });
    } else {
      chart.set({ ...base, points: rows.map((r) => ({ x: r.t, y: r.x, frame: r.frame, out: r.out })),
        fit: a && a.fitX ? a.fitX.eval : null, yLabel: 'x (m)', yName: 'x', yUnit: 'm', empty: 'Track the ball to plot horizontal position' });
    }
  }

  function drawTable(rows) {
    const body = $('dataTable').tBodies[0];
    if (!rows.length) {
      body.innerHTML = '<tr><td class="empty" colspan="5">No points yet. Use Pick ball or Auto-find ball.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((r) =>
      `<tr data-frame="${r.frame}" class="${r.out ? 'is-out' : ''}${r.frame === state.frame ? ' is-current' : ''}">` +
      `<td>${r.frame}</td><td>${r.t.toFixed(4)}</td><td>${r.x.toFixed(4)}</td><td>${r.y.toFixed(4)}</td>` +
      `<td>${r.vy === null ? '' : r.vy.toFixed(3)}</td></tr>`).join('');
  }

  function highlightCurrent() {
    const body = $('dataTable').tBodies[0];
    const old = body.querySelector('.is-current');
    if (old) old.classList.remove('is-current');
    const row = body.querySelector(`tr[data-frame="${state.frame}"]`);
    if (row) {
      row.classList.add('is-current');
      const wrap = row.closest('.table-wrap');
      if (row.offsetTop < wrap.scrollTop + 28 || row.offsetTop > wrap.scrollTop + wrap.clientHeight - 28) {
        wrap.scrollTop = row.offsetTop - wrap.clientHeight / 2;
      }
    }
    if (chart.spec.points) { chart.spec.current = state.frame; chart.draw(); }
  }

  function csv() {
    const lines = ['frame,t_s,x_m,y_m,vy_m_per_s,in_fit'];
    for (const r of trackedRows()) {
      lines.push([r.frame, r.t.toFixed(5), r.x.toFixed(5), r.y.toFixed(5), r.vy === null ? '' : r.vy.toFixed(5), r.out ? 0 : 1].join(','));
    }
    return lines.join('\n') + '\n';
  }

  // ---------- controls ----------
  $('fileInput').addEventListener('change', (e) => { openFile(e.target.files[0]); e.target.value = ''; });
  $('btnDemo').addEventListener('click', loadDemo);
  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('btnAutoFind').addEventListener('click', autoFind);
  $('btnTrack').addEventListener('click', startTracking);
  $('btnStop').addEventListener('click', stopTracking);
  $('btnClear').addEventListener('click', () => {
    state.points.clear(); state.template = null;
    updateAnalysis(); render();
    status('Track cleared.');
  });
  $('btnDeletePoint').addEventListener('click', () => {
    if (state.points.delete(state.frame)) { updateAnalysis(); render(); status(`Deleted the point on frame ${state.frame}.`); }
  });

  $('frameSlider').addEventListener('input', (e) => { if (!state.tracking) showFrame(+e.target.value); });
  // Step from the frame most recently asked for, so quick key presses add up while a frame loads.
  const step = (d) => {
    if (state.tracking || !state.source) return;
    const base = wantedFrame !== null ? wantedFrame : loadingFrame !== null ? loadingFrame : state.frame;
    showFrame(base + d);
  };
  $('btnPrev').addEventListener('click', () => step(-state.step));
  $('btnNext').addEventListener('click', () => step(state.step));
  $('btnFirst').addEventListener('click', () => step(-1e9));
  $('btnLast').addEventListener('click', () => step(1e9));
  $('btnSetStart').addEventListener('click', () => {
    state.range.start = state.frame;
    if (state.range.end < state.frame) state.range.end = state.source.frameCount - 1;
    updateAnalysis(); render();
  });
  $('btnSetEnd').addEventListener('click', () => {
    state.range.end = state.frame;
    if (state.range.start > state.frame) state.range.start = 0;
    updateAnalysis(); render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowRight') { step(e.shiftKey ? 10 : state.step); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { step(e.shiftKey ? -10 : -state.step); e.preventDefault(); }
    if (e.key === 'Escape') stopTracking();
  });

  const num = (id, fallback) => { const v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : fallback; };
  $('fileFps').addEventListener('change', () => {
    const fps = num('fileFps', state.fileFps);
    if (fps === state.fileFps) return;
    const had = state.points.size;
    const keepCapture = state.captureFps !== state.fileFps;
    state.points.clear(); state.template = null;
    setFps(fps, keepCapture ? state.captureFps : fps);
    showFrame(0);
    updateAnalysis();
    if (had) status('Frame rate changed, so frame numbers moved. The track was cleared; pick the ball again.', 'warn');
  });
  $('captureFps').addEventListener('change', () => { state.captureFps = num('captureFps', state.captureFps); updateAnalysis(); });
  $('frameStep').addEventListener('change', () => { state.step = Math.round(num('frameStep', 1)); });
  $('btnDetectFps').addEventListener('click', async () => {
    const src = state.source;
    if (!src || src.kind !== 'video') { status('The demo clip is fixed at 120 fps. Open a video to detect its frame rate.'); return; }
    status('Measuring the frame rate…');
    const fps = await detectFps(src.video);
    if (fps) { $('fileFps').value = fps; $('fileFps').dispatchEvent(new Event('change')); status(`Frame rate: ${fps} fps.`); }
    else status('This browser cannot report frame timing. Enter the frame rate from the camera settings.', 'warn');
  });
  $('calLength').addEventListener('input', () => { state.calib.length = num('calLength', state.calib.length); updateAnalysis(); render(); });
  $('gRef').addEventListener('input', () => { state.gRef = num('gRef', 9.81); updateAnalysis(); });
  $('method').addEventListener('change', (e) => { state.method = e.target.value; });
  $('ballR').addEventListener('change', () => {
    state.ballR = Math.round(num('ballR', state.ballR));
    const cur = state.points.get(state.frame);
    if (cur && state.img) seed(state.frame, cur.x, cur.y);
    render();
  });
  $('tolerance').addEventListener('input', (e) => { state.tolerance = +e.target.value; $('tolRead').textContent = e.target.value; });
  $('evolve').addEventListener('input', (e) => { state.evolve = +e.target.value / 100; $('evolveRead').textContent = e.target.value + '%'; });

  document.querySelectorAll('[data-chart]').forEach((b) => b.addEventListener('click', () => {
    state.chart = b.dataset.chart;
    document.querySelectorAll('[data-chart]').forEach((t) => t.setAttribute('aria-selected', String(t === b)));
    updateAnalysis();
  }));
  $('dataTable').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-frame]');
    if (tr && !state.tracking) showFrame(+tr.dataset.frame);
  });

  $('btnCopy').addEventListener('click', () => {
    const text = csv();
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* ignored */ }
      ta.remove();
      status(ok ? 'Data copied as CSV. Paste it into a spreadsheet.' : 'Copy is blocked here. Use Download CSV instead.', ok ? 'good' : 'warn');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => status('Data copied as CSV. Paste it into a spreadsheet.', 'good'), fallback);
    } else fallback();
  });
  $('btnDownload').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([csv()], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = (state.source && state.source.kind === 'video' ? state.source.label.replace(/\.[^.]+$/, '') : 'demo') + '-track.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Drag and drop a video anywhere on the page.
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { dragDepth++; $('dropHint').hidden = false; } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dropHint').hidden = true; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0; $('dropHint').hidden = true;
    if (e.dataTransfer.files[0]) openFile(e.dataTransfer.files[0]);
  });
  window.addEventListener('resize', requestRender);

  // Start with the demo clip so the first view shows the whole workflow.
  window.TP.app = { state, showFrame, startTracking, autoFind, openFile, csv };
  loadDemo();
})();
