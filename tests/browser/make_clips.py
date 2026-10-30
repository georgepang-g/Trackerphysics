"""
Generate test videos of a dropped ball with known motion, independent of js/demo.js.

    python3 tests/browser/make_clips.py OUT_DIR

Needs numpy and ffmpeg. Writes several clips plus truth.json describing, for each clip,
the true ball centre on every frame, the metre-stick ends and the floor point in pixels.
"""
import json
import os
import subprocess
import sys

import numpy as np

G = 9.81


def ball_height(t, h0, t_release, r, e=0.6):
    """Height of the ball centre (m): held until t_release, then falls and bounces."""
    if t <= t_release:
        return h0
    t -= t_release
    h, v = h0, 0.0
    while True:
        # time to reach the floor (centre at height r) from (h, v)
        a = 0.5 * G
        disc = v * v + 2 * G * (h - r)
        t_hit = (v + np.sqrt(disc)) / G
        if t <= t_hit:
            return h + v * t - a * t * t
        t -= t_hit
        v_hit = v - G * t_hit
        h, v = r, -e * v_hit
        if v < 0.05:
            return r


def render_clip(name, out_dir, W, H, fps, seconds, ppm, floor_y, stick_x, ball_x, seed, file_fps=None,
                crf=28, ball_color=(205, 225, 40), extra=()):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

    # Background: lit wall with clutter, floor, a metre stick in 10 cm bands.
    bg = np.zeros((H, W, 3), np.float32)
    light = 0.75 + 0.35 * np.exp(-(((xx - W * 0.55) / (W * 0.6)) ** 2 + ((yy - H * 0.3) / (H * 0.7)) ** 2))
    bg[:] = np.array([178, 170, 158], np.float32)
    for _ in range(14):  # posters and boxes
        w, h = rng.integers(W // 20, W // 6), rng.integers(H // 20, H // 5)
        x0, y0 = rng.integers(0, W - w), rng.integers(0, max(1, floor_y - h))
        if abs((x0 + w / 2) - ball_x) < w / 2 + 40:  # keep the drop path itself clear
            continue
        bg[y0:y0 + h, x0:x0 + w] = rng.integers(30, 230, 3)
    bg[floor_y:] = [92, 80, 70]
    bg *= light[..., None]
    stick_top = floor_y - ppm
    for k in range(10):
        y1, y0 = floor_y - int(round(k * ppm / 10)), floor_y - int(round((k + 1) * ppm / 10))
        bg[y0:y1, stick_x - 9:stick_x + 9] = [235, 228, 210] if k % 2 == 0 else [40, 40, 44]
    for (x0, y0, x1, y1, c) in extra:
        bg[y0:y1, x0:x1] = c

    r_m = 0.033
    r_px = r_m * ppm
    h0 = (floor_y - H * 0.12) / ppm
    t_release = 0.2
    n = int(round(seconds * fps))
    exposure = 1 / 250
    truth = []
    frames = []
    for i in range(n):
        t = i / fps
        img = bg.copy()
        acc = np.zeros((H, W), np.float32)
        shade = np.zeros((H, W), np.float32)
        subs = 5
        for s in range(subs):
            ts = t + (s / (subs - 1) - 0.5) * exposure
            cx = ball_x + 0.04 * max(0, ts - t_release) * ppm
            cy = floor_y - ball_height(ts, h0, t_release, r_m) * ppm
            d = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
            a = np.clip(r_px + 0.5 - d, 0, 1)
            acc += a
            shade += a * np.clip(1.05 - ((xx - cx) + (yy - cy)) / (r_px * 2.4), 0.5, 1.25)
        cov = acc / subs
        sh = np.where(acc > 0, shade / np.maximum(acc, 1e-6), 1)
        col = np.array(ball_color, np.float32)[None, None, :] * sh[..., None]
        img = img * (1 - cov[..., None]) + col * cov[..., None]
        img += rng.normal(0, 4, img.shape)
        frames.append(np.clip(img, 0, 255).astype(np.uint8))
        truth.append([ball_x + 0.04 * max(0, t - t_release) * ppm,
                      floor_y - ball_height(t, h0, t_release, r_m) * ppm])

    path = os.path.join(out_dir, name)
    cmd = ['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
           '-r', str(file_fps or fps), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', str(crf), path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in frames:
        p.stdin.write(f.tobytes())
    p.stdin.close()
    p.wait()
    # First frame after release, and last frame before the ball first touches the floor.
    release = int(np.floor(t_release * fps)) + 1
    contact = int(np.floor((t_release + np.sqrt(2 * (h0 - r_m) / G)) * fps))
    return {
        'file': name, 'width': W, 'height': H, 'fps': file_fps or fps, 'capture_fps': fps, 'frames': n,
        'ppm': ppm, 'stick': [[stick_x, floor_y], [stick_x, stick_top]], 'floor': [stick_x, floor_y],
        'release': release, 'contact': contact, 'radius': r_px, 'truth': truth,
    }


def ff(*args):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *args], check=True)


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    clips = {}
    # Phone-like landscape clip at 60 fps.
    c = render_clip('drop60.mp4', out_dir, 1280, 720, 60, 1.2, 380, 660, 200, 700, seed=1,
                    extra=[(1100, 120, 1200, 260, (215, 220, 50))])  # a yellow poster to distract colour tracking
    clips['mp4'] = c
    src = os.path.join(out_dir, 'drop60.mp4')
    # Same clip with an audio track in a MOV container, and as VP9 WebM.
    ff('-i', src, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.2', '-c:v', 'copy', '-c:a', 'aac', '-shortest',
       os.path.join(out_dir, 'drop60.mov'))
    clips['mov'] = dict(c, file='drop60.mov')
    ff('-i', src, '-c:v', 'libvpx-vp9', '-b:v', '2M', os.path.join(out_dir, 'drop60.webm'))
    clips['webm'] = dict(c, file='drop60.webm')
    # 4K upscale: tests downscaling to 1920 wide and click mapping on a scaled canvas.
    ff('-i', src, '-vf', 'scale=3840:2160', '-c:v', 'libx264', '-crf', '28', os.path.join(out_dir, 'drop4k.mp4'))
    k = 3.0
    clips['4k'] = dict(c, file='drop4k.mp4', width=3840, height=2160, ppm=c['ppm'] * k, radius=c['radius'] * k,
                       stick=[[x * k, y * k] for x, y in c['stick']], floor=[v * k for v in c['floor']],
                       truth=[[x * k, y * k] for x, y in c['truth']])
    # Portrait phone recording: stored landscape with rotation metadata, displayed portrait.
    p = render_clip('portrait_raw.mp4', out_dir, 720, 1280, 60, 1.0, 520, 1200, 140, 400, seed=2,
                    ball_color=(230, 90, 30))
    ff('-i', os.path.join(out_dir, 'portrait_raw.mp4'), '-vf', 'transpose=2', '-c:v', 'libx264', '-crf', '26',
       os.path.join(out_dir, 'portrait_stored.mp4'))
    ff('-display_rotation', '-90', '-i', os.path.join(out_dir, 'portrait_stored.mp4'), '-c', 'copy',
       os.path.join(out_dir, 'portrait.mp4'))
    clips['portrait'] = dict(p, file='portrait.mp4')
    # Slow motion: captured at 240 fps, saved as a 30 fps file.
    s = render_clip('slowmo.mp4', out_dir, 960, 540, 240, 0.75, 300, 500, 150, 520, seed=3, file_fps=30)
    clips['slowmo'] = s
    with open(os.path.join(out_dir, 'truth.json'), 'w') as f:
        json.dump(clips, f)
    with open(os.path.join(out_dir, 'notes.txt'), 'w') as f:
        f.write('not a video\n')
    for key, c in clips.items():
        print(key, c['file'], f"{c['frames']} frames, release {c['release']}, floor contact {c['contact']}")


if __name__ == '__main__':
    main(sys.argv[1])
