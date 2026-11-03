"""
Analyse the tracked full-resolution drops.

    python3 hi_analyze.py TRACK_DIR OUT.json

For each run: release frame (last frame at rest), touchdown (where the falling and rebounding paths meet),
pixels per metre from the 82.5 cm drop, and the free-fall rows used for the lab tables.
"""
import glob, json, os, sys
import numpy as np

H_DROP = 0.825          # m, bottom of the ball to the base plate (George's measurement)
src, out = sys.argv[1], sys.argv[2]
runs = []
for path in sorted(glob.glob(os.path.join(src, 'track_*.json'))):
    name = 'IMG_' + os.path.basename(path)[6:-5]
    d = json.load(open(path))
    tr = [t for t in d['track'] if not t.get('lost')]
    f = np.array([t['frame'] for t in tr]); t = np.array([t['t'] for t in tr]); y = np.array([t['y'] for t in tr])

    # Clearly falling: first frame 300 px (about 13 cm) below where the ball hung in the first frames.
    k_fall = int(np.nonzero(y > np.median(y[:10]) + 300)[0][0])
    # Resting height: just before the drop (the ball sways a little on its string earlier on).
    base = float(np.median(y[max(0, k_fall - 45):k_fall - 25]))
    k = k_fall
    while k > 0 and y[k - 1] > base + 1.0:
        k -= 1
    k_rel = k - 1                                   # last frame still at rest
    y_rest = float(np.median(y[max(0, k_rel - 12):k_rel + 1]))

    # Lowest point: the first local maximum of y after release (ball on the plate).
    k_bot = k_fall
    while k_bot + 1 < len(y) and y[k_bot + 1] > y[k_bot]:
        k_bot += 1
    dn = np.arange(k_rel + 1, k_bot)                # falling, before touching the plate
    tt = t - t[k_rel]
    c2, b1, a1 = np.polyfit(tt[dn], y[dn], 2)
    # Rebound: the next few frames while rising; same curvature, fit the straight-line part.
    up = []
    for j in range(k_bot + 1, min(len(y), k_bot + 8)):
        if up and y[j] >= y[up[-1]]: break
        up.append(j)
    up = np.array(up[:5])
    b2, a2 = np.polyfit(tt[up], y[up] - c2 * tt[up] ** 2, 1)
    tc = (a2 - a1) / (b1 - b2)
    yc = c2 * tc ** 2 + b1 * tc + a1
    # Cubic fit of the fall: acceleration at the start and at the end (air-resistance check).
    c3 = np.polyfit(tt[dn], y[dn], 3)
    acc = lambda x: 2 * c3[1] + 6 * c3[0] * x
    runs.append(dict(
        name=name, W=d['W'], H=d['H'], release_frame=int(f[k_rel]), bottom_frame=int(f[k_bot]),
        y_rest=y_rest, y_contact=float(yc), t_contact=float(tc), drop_px=float(yc - y_rest),
        ppm=float((yc - y_rest) / H_DROP), g_px_quadratic=float(2 * c2),
        acc_px_start=float(acc(tt[dn][0])), acc_px_end=float(acc(tt[dn][-1])),
        rows=[dict(frame=int(f[j]), t=float(t[j]), y=float(y[j])) for j in range(k_rel, k_bot)],
        rebound_frames=[int(f[j]) for j in up]))
    r = runs[-1]
    print(f"{name}: release frame {r['release_frame']} (t={t[k_rel]:.4f}s), touchdown {tc*1000:.1f} ms later, "
          f"{len(dn)} falling frames, drop {r['drop_px']:.1f} px → {r['ppm']:.1f} px/m, rest y {y_rest:.1f}, x≈{np.mean([q['x'] for q in tr[:10]]):.0f}")
ppm = np.array([r['ppm'] for r in runs])
print(f'scale: mean {ppm.mean():.1f} px/m, sd {ppm.std(ddof=1):.1f} ({100 * ppm.std(ddof=1) / ppm.mean():.2f}%)')
for r in runs:
    s = ppm.mean()
    print(f"{r['name']}: g (quadratic) {r['g_px_quadratic']/s:.3f}, accel start {r['acc_px_start']/s:.2f} end {r['acc_px_end']/s:.2f} m/s², "
          f"fall time {r['t_contact']*1000:.1f} ms")
json.dump(dict(H_drop=H_DROP, runs=runs), open(out, 'w'))
