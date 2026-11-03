"""
Track the green ball in a full-resolution iPhone video, keeping each frame's real timestamp.

    python3 hi_track.py VIDEO OUT.json

Decodes a vertical strip around the hanging ball at half resolution (variable frame rate is kept:
one output frame per recorded frame), finds the ball by greenness (G minus the larger of R and B),
and writes positions in full-resolution pixels with the frame times in seconds.
"""
import json, subprocess, sys
import numpy as np
from scipy import ndimage

video, out = sys.argv[1], sys.argv[2]
W, H = map(int, subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                                 '-of', 'csv=p=0', video], capture_output=True, text=True).stdout.strip().split(','))
# Timestamps of the frames that are shown. Clips trimmed on the iPhone keep the cut frames in the file but
# hide them with an edit list; the decoder skips them, so read the decoded frames' times, not the packets'.
pts = [float(l.strip().strip(',')) for l in subprocess.run(
    ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', video],
    capture_output=True, text=True).stdout.split() if l.strip()]

def decode(vf, w, h, extra=()):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', video, *extra, '-vf', vf, '-fps_mode', 'passthrough',
                          '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)

def greenness(F):
    F = F.astype(np.int16)
    return F[..., 1] - np.maximum(F[..., 0], F[..., 2])

# 1. Where does the ball hang? First frame at quarter size, biggest green blob in the top fifth.
q = decode(f'scale={W // 4}:{H // 4}', W // 4, H // 4, ('-frames:v', '1'))[0]
g0 = greenness(q[: H // 20]) > 25
lab, n = ndimage.label(g0)
k = 1 + int(np.argmax(ndimage.sum(g0, lab, range(1, n + 1))))
bx = float(np.nonzero(lab == k)[1].mean()) * 4

# 2. Strip around the ball's path, half resolution.
S = 2
x0 = int(max(0, bx - 400)) // 2 * 2
cw = min(800, W - x0)
F = decode(f'crop={cw}:{H}:{x0}:0,scale={cw // S}:{H // S}', cw // S, H // S)
assert len(F) == len(pts), (len(F), len(pts))
G = greenness(F)
thr = 22

def blob(mask, ox, oy, min_px=150):
    lab, n = ndimage.label(mask)
    if n == 0: return None
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    k = int(np.argmax(sizes)) + 1
    if sizes[k - 1] < min_px: return None
    ys, xs = np.nonzero(lab == k)
    return dict(x=float(xs.mean() + ox), y=float(ys.mean() + oy), n=int(sizes[k - 1]),
                top=float(ys.min() + oy), bottom=float(ys.max() + oy), left=float(xs.min() + ox), right=float(xs.max() + ox))

b = blob(G[0, : H // (5 * S)] > thr, 0, 0)
track = [dict(frame=0, t=pts[0], **b)]
for i in range(1, len(F)):
    h = track[-3:]
    if len(h) >= 3:
        dt1 = h[-1]['t'] - h[-2]['t']; dt0 = h[-2]['t'] - h[-3]['t']; dt = pts[i] - h[-1]['t']
        v1 = (h[-1]['y'] - h[-2]['y']) / dt1; v0 = (h[-2]['y'] - h[-3]['y']) / dt0
        a = (v1 - v0) / ((dt1 + dt0) / 2)
        py = h[-1]['y'] + v1 * dt + 0.5 * a * dt * dt
        px = h[-1]['x'] + (h[-1]['x'] - h[-2]['x']) * dt / dt1
        step = abs(v1 * dt) + abs(a) * dt * dt
    else:
        py, px, step = h[-1]['y'], h[-1]['x'], 0
    R = int(max(60, 1.5 * step + 40))
    xa, xb = max(0, int(px - 70)), min(G.shape[2], int(px + 70))
    ya, yb = max(0, int(py - R)), min(G.shape[1], int(py + R))
    b = blob(G[i, ya:yb, xa:xb] > thr, xa, ya)
    if b is None:
        track.append(dict(frame=i, t=pts[i], lost=True)); break
    track.append(dict(frame=i, t=pts[i], **b))

# Back to full-resolution pixels.
for t in track:
    for key in ('x', 'left', 'right'):
        if key in t: t[key] = t[key] * S + x0
    for key in ('y', 'top', 'bottom'):
        if key in t: t[key] = t[key] * S
json.dump(dict(W=W, H=H, n=len(F), crop_x0=x0, scale=S, track=track), open(out, 'w'))
lost = [t['frame'] for t in track if t.get('lost')]
print(f'{video.split("/")[-1]}: {len(F)} frames, ball at x≈{bx:.0f}, tracked {len(track)} frames' + (f', lost at {lost[0]}' if lost else ''))
