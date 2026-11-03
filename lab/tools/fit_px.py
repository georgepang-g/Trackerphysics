"""Fit the free fall in pixel units. Positions are scaled to a 640-wide frame so all videos compare."""
import json, sys
import numpy as np
A = sys.argv[1]
fps = 30.0
rows = []
for v in range(1, 7):
    d = json.load(open(f'{A}/track_v{v}.json'))
    s = 640 / d['W']
    tr = [t for t in d['track'] if not t.get('lost')]
    f = np.array([t['frame'] for t in tr]); y = np.array([t['y'] for t in tr]) * s
    # Release: last frame before the ball has moved more than 1.5 px below its resting height.
    rest = np.median(y[:5])
    moving = np.nonzero(y > rest + 1.5)[0]
    rel = int(f[moving[0] - 1])
    # Bottom: the lowest point before the bounce; drop that frame (ball touching the base).
    after = np.nonzero(f > rel)[0]
    k_bot = after[0] + int(np.argmax(y[after][: np.argmax(np.diff(y[after]) < 0) + 1]))
    bot = int(f[k_bot])
    use = (f >= rel + 1) & (f <= bot - 1)
    t = (f[use] - rel) / fps
    c, cov = np.polyfit(t, y[use], 2, cov=True)
    fit = np.polyval(c, t); r2 = 1 - np.sum((y[use] - fit) ** 2) / np.sum((y[use] - y[use].mean()) ** 2)
    g_px = 2 * c[0]; g_err = 2 * np.sqrt(cov[0, 0])
    rows.append(dict(video=v, release=rel, bottom=bot, n=int(use.sum()), g_px=g_px, g_err=g_err, r2=r2,
                     v0=c[1], drop_px=float(y[f == bot][0] - rest), rest_y=float(rest)))
    print(f"v{v}: release frame {rel}, ball reaches base at frame {bot} ({(bot-rel)/fps:.3f} s), "
          f"{use.sum()} points, g = {g_px:7.0f} ± {g_err:4.0f} px/s², R² {r2:.5f}, v0 {c[1]:6.1f} px/s, drop {rows[-1]['drop_px']:.0f} px")
json.dump(rows, open(f'{A}/fits_px.json', 'w'))
g = np.array([r['g_px'] for r in rows]); print(f"mean {g.mean():.0f} px/s², sd {g.std(ddof=1):.0f} ({100*g.std(ddof=1)/g.mean():.1f}%)")
