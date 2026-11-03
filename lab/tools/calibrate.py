"""Scale from the 82.5 cm drop: the ball's centre falls 0.825 m from rest until it touches the base.
Contact = where the falling parabola meets the rebounding one (same acceleration)."""
import json, sys
import numpy as np
A = sys.argv[1]; FPS = 30.0; H = 0.825
out = []
for v in range(1, 7):
    d = json.load(open(f'{A}/track_run{v}.json'))
    fit = next(r for r in json.load(open(f'{A}/fits_px.json')) if r['video'] == v)
    tr = [t for t in d['track'] if not t.get('lost')]
    f = np.array([t['frame'] for t in tr]); y = np.array([t['y'] for t in tr])
    rel, bot = fit['release'], fit['bottom']
    y_rest = float(np.median(y[f <= rel][-8:]))
    dn = (f >= rel + 1) & (f <= bot - 1)
    t = (f - rel) / FPS
    c2, b1, a1 = np.polyfit(t[dn], y[dn], 2)
    # Rebound: frames after the lowest one while the ball is still rising.
    up = []
    for k in np.nonzero(f > bot)[0]:
        if up and y[k] >= y[up[-1]]: break
        up.append(k)
        if len(up) == 4: break
    up = np.array(up)
    # Same acceleration on the way up; fit only the straight-line part.
    b2, a2 = np.polyfit(t[up], y[up] - c2 * t[up] ** 2, 1)
    tc = (a2 - a1) / (b1 - b2)
    yc = c2 * tc ** 2 + b1 * tc + a1
    t0 = -b1 / (2 * c2)                      # instant the ball left rest (vertex of the fall)
    y0 = c2 * t0 ** 2 + b1 * t0 + a1
    drop_px = yc - y_rest
    ppm = drop_px / H
    out.append(dict(video=v, W=d['W'], y_rest=y_rest, y_vertex=y0, t_release=t0, t_contact=tc, y_contact=yc,
                    drop_px=drop_px, ppm=ppm, ppm640=ppm * 640 / d['W'], up_frames=f[up].tolist()))
    print(f"v{v}: rest y {y_rest:6.1f}, fit vertex y {y0:6.1f} at t {t0*1000:5.1f} ms, contact at t {tc:.4f} s, y {yc:6.1f}; "
          f"drop {drop_px:6.1f} px → {ppm:6.1f} px/m ({ppm*640/d['W']:.1f} per 640 px); rebound frames {f[up].tolist()}")
json.dump(out, open(f'{A}/calib.json', 'w'), indent=1)
p = np.array([o['ppm640'] for o in out]); print(f"scale per 640-px frame: mean {p.mean():.1f}, sd {p.std(ddof=1):.1f} ({100*p.std(ddof=1)/p.mean():.1f}%)")
