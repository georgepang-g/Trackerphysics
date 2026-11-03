"""Track the green ball by 'greenness' (G minus the larger of R and B). Usage: green_track.py video out.json"""
import json, subprocess, sys
import numpy as np
from scipy import ndimage

video, out = sys.argv[1], sys.argv[2]
W, H = map(int, subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height',
                                 '-of', 'csv=p=0', video], capture_output=True, text=True).stdout.strip().split(','))
raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', video, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
F = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).astype(np.int16)
green = F[..., 1] - np.maximum(F[..., 0], F[..., 2])          # how much greener than red/blue
s = W / 640                                                     # scale relative to a 640-wide frame

def blob(mask, x0, y0):
    lab, n = ndimage.label(mask)
    if n == 0: return None
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    k = int(np.argmax(sizes)) + 1
    if sizes[k - 1] < 15 * s * s: return None
    ys, xs = np.nonzero(lab == k)
    return dict(x=float(xs.mean() + x0), y=float(ys.mean() + y0), n=int(sizes[k - 1]),
                top=float(ys.min() + y0), bottom=float(ys.max() + y0))

# Seed: biggest green blob in the top fifth of frame 0, near the stand.
b0 = blob(green[0, :H // 5, :] > 18, 0, 0)
track = [dict(frame=0, **b0)]
for i in range(1, len(F)):
    h = [t for t in track[-3:]]
    if len(h) >= 3:
        v1 = h[-1]['y'] - h[-2]['y']; v0 = h[-2]['y'] - h[-3]['y']
        py = h[-1]['y'] + v1 + (v1 - v0); px = h[-1]['x'] + (h[-1]['x'] - h[-2]['x'])
        speed = abs(v1) + abs(v1 - v0)
    else:
        py, px, speed = h[-1]['y'], h[-1]['x'], 0
    R = int(max(40 * s, 1.5 * speed + 25 * s))
    x0, x1 = max(0, int(px - 45 * s)), min(W, int(px + 45 * s))
    y0, y1 = max(0, int(py - R)), min(H, int(py + R))
    b = blob(green[i, y0:y1, x0:x1] > 18, x0, y0)
    if b is None: track.append(dict(frame=i, lost=True)); break
    track.append(dict(frame=i, **b))
json.dump(dict(W=W, H=H, n=len(F), track=track), open(out, 'w'))
for t in track:
    print(t['frame'], 'LOST' if t.get('lost') else f"x={t['x']:.1f} y={t['y']:.1f} n={t['n']} top={t['top']:.0f} bottom={t['bottom']:.0f}")
