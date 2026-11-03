"""
Make the print pack for the lab book: one PDF with each item on its own page, ready to cut out and glue in.

    python3 lab/tools/make_print_pack.py lab/Experiment2_Gravity_George.xlsx lab/print

Reads the recalculated analysis workbook, so every number matches it. Needs Playwright (Chromium).
"""
import base64, sys
from pathlib import Path
import numpy as np
from openpyxl import load_workbook

SRC, OUTDIR = Path(sys.argv[1]), Path(sys.argv[2])
EX = 3                                   # worked example: Run 3 (closest to the mean)
wb = load_workbook(SRC, data_only=True)


def run_rows(n):
    ws = wb[f'Run {n}']
    rows, r = [], 5
    while ws.cell(r, 1).value is not None:
        rows.append(dict(frame=ws.cell(r, 1).value, t=ws.cell(r, 3).value, h=ws.cell(r, 5).value,
                         hs=ws.cell(r, 6).value, v=ws.cell(r, 7).value))
        r += 1
    return ws, rows


def fmt(x, d):
    return '' if x is None or x == '' else f'{x:.{d}f}'.replace('-', '−')


def svg_chart(xs, ys, title, xlabel, ylabel, w=640, h=420, xmax=None, ymin=None, ymax=0.0, xstep=0.05, ystep=0.5):
    m, b = np.polyfit(xs, ys, 1)
    r2 = np.corrcoef(xs, ys)[0, 1] ** 2
    L, R, T, B = 70, 20, 50, 60
    xmax = xmax or max(xs) * 1.05
    ymin = ymin if ymin is not None else np.floor(min(ys) / ystep) * ystep
    sx = lambda x: L + (x / xmax) * (w - L - R)
    sy = lambda y: T + (ymax - y) / (ymax - ymin) * (h - T - B)
    out = [f'<svg viewBox="0 0 {w} {h}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Arial" font-size="13">',
           f'<rect x="0" y="0" width="{w}" height="{h}" fill="#fff"/>',
           f'<text x="{w/2}" y="26" text-anchor="middle" font-size="16" font-weight="bold">{title}</text>']
    x = 0.0
    while x <= xmax + 1e-9:
        out.append(f'<line x1="{sx(x)}" y1="{T}" x2="{sx(x)}" y2="{h-B}" stroke="#ddd"/>')
        out.append(f'<text x="{sx(x)}" y="{h-B+18}" text-anchor="middle">{x:.2f}</text>')
        x += xstep
    y = ymax
    while y >= ymin - 1e-9:
        out.append(f'<line x1="{L}" y1="{sy(y)}" x2="{w-R}" y2="{sy(y)}" stroke="#ddd"/>')
        label = f'{y:.1f}'.replace('-', '−')
        out.append(f'<text x="{L-8}" y="{sy(y)+4}" text-anchor="end">{label}</text>')
        y -= ystep
    out.append(f'<rect x="{L}" y="{T}" width="{w-L-R}" height="{h-T-B}" fill="none" stroke="#444"/>')
    for xi, yi in zip(xs, ys):
        out.append(f'<circle cx="{sx(xi):.1f}" cy="{sy(yi):.1f}" r="2.6" fill="#1F4E79"/>')
    out.append(f'<line x1="{sx(0)}" y1="{sy(b)}" x2="{sx(xmax)}" y2="{sy(m*xmax+b)}" stroke="#C00000" stroke-width="1.6"/>')
    eq = f'y = {m:.4f}x {"+" if b >= 0 else "−"} {abs(b):.4f}'.replace('-', '−')
    out.append(f'<text x="{w-R-12}" y="{T+22}" text-anchor="end" fill="#C00000" font-weight="bold">{eq}</text>')
    out.append(f'<text x="{w-R-12}" y="{T+40}" text-anchor="end" fill="#C00000" font-weight="bold">R² = {r2:.4f}</text>')
    out.append(f'<text x="{(L+w-R)/2}" y="{h-14}" text-anchor="middle" font-weight="bold">{xlabel}</text>')
    out.append(f'<text transform="translate(18,{(T+h-B)/2}) rotate(-90)" text-anchor="middle" font-weight="bold">{ylabel}</text>')
    out.append('</svg>')
    return '\n'.join(out), m, b, r2


css = """
@page { size: Letter; margin: 0.6in; }
body { font-family: Arial, sans-serif; color: #111; }
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
h2 { font-size: 15pt; margin: 0 0 4px; }
p.note { font-size: 9pt; color: #444; margin: 0 0 10px; }
.cut { border: 1.5px dashed #888; padding: 10px; }
table { border-collapse: collapse; font-size: 9pt; width: 100%; }
th { background: #1F4E79; color: #fff; padding: 3px 4px; }
td { border: 1px solid #bbb; padding: 0.5px 6px; line-height: 1.12; text-align: center; font-variant-numeric: tabular-nums; }
table.data { font-size: 8.5pt; }
sub { line-height: 0; font-size: 70%; }
tr:nth-child(even) td { background: #f3f6fa; }
img { width: 100%; }
"""
pages = []

# 1. Example of tracking
img = base64.b64encode((OUTDIR / 'tracking_run3.png').read_bytes()).decode()
pages.append(f"""<div class="page"><div class="cut">
<h2>Example of tracking the ball (Run {EX}, IMG_3051)</h2>
<p class="note">Every sixth frame of the fall (120 fps). The pink circle marks the centre of the ball measured in that frame;
the time under each frame is the time since the ball was released.</p>
<img src="data:image/png;base64,{img}"></div></div>""")

# 2. Recorded data for the example run
ws, rows = run_rows(EX)
body = ''.join(f'<tr><td>t<sub>{i+1}</sub></td><td>{fmt(r["t"],3)}</td><td>{fmt(r["h"],3)}</td><td>{fmt(r["hs"],3)}</td><td>{fmt(r["v"],3)}</td></tr>'
               for i, r in enumerate(rows))
pages.append(f"""<div class="page"><div class="cut">
<h2>Recorded data for Run {EX} (IMG_3051)</h2>
<table class="data"><tr><th></th><th>Time (s)</th><th>Height (m)</th><th>Smoothed height (m)</th><th>Average velocity (m/s)</th></tr>{body}</table>
</div></div>""")

# 3. Velocity-time graph for the example run
pts = [(r['t'], r['v']) for r in rows if isinstance(r['v'], float)]
svg, m, b, r2 = svg_chart([p[0] for p in pts], [p[1] for p in pts],
                          f'Average Velocity (m/s) vs Elapsed Time (s) of a Falling Ball (Run {EX})',
                          'Elapsed Time (s)', 'Average Velocity (m/s)', xmax=0.40, ymin=-4.0)
pages.append(f'<div class="page"><div class="cut">{svg}</div></div>')

# 4. Table of g for all runs
trs = ''
runs = [n for n in range(1, 10)]
gs = []
for n in runs:
    w = wb[f'Run {n}']
    _, rr = run_rows(n)
    p = [(q['t'], q['v']) for q in rr if isinstance(q['v'], float)]
    mm, bb = np.polyfit([a for a, _ in p], [c for _, c in p], 1)
    g = w['J6'].value; gs.append(g)
    video = w['A1'].value.split('—')[1].strip().replace('.MOV', '')
    eq = f'y = {mm:.4f}x {"+" if bb >= 0 else "−"} {abs(bb):.4f}'.replace('-', '−')
    trs += f'<tr><td>{n}</td><td>{video}</td><td>{eq}</td><td>{w["J7"].value:.4f}</td><td>{g:.4f}</td></tr>'
gs = np.array(gs)
pages.append(f"""<div class="page"><div class="cut">
<h2>Value of g for each run</h2>
<table style="font-size:11pt"><tr><th>Run #</th><th>Video</th><th>Trendline equation</th><th>R² value</th><th>Value of g (m/s²)</th></tr>{trs}</table>
<p class="note" style="margin-top:8px">g = −(slope of the average velocity vs elapsed time trendline). Mean = {gs.mean():.4f} m/s²,
sample standard deviation (TI-84 Sx) = {gs.std(ddof=1):.4f} m/s², population (TI-84 σx) = {gs.std(ddof=0):.4f} m/s², n = {len(gs)}.</p>
</div></div>""")

# 5. All runs combined
al = wb['All runs']
xs, ys, r = [], [], 5
while al.cell(r, 7).value is not None:
    xs.append(al.cell(r, 8).value); ys.append(al.cell(r, 9).value); r += 1
svg2, m2, b2, r22 = svg_chart(xs, ys, f'Average Velocity vs Elapsed Time — all 9 runs combined ({len(xs)} points)',
                              'Elapsed Time (s)', 'Average Velocity (m/s)', xmax=0.40, ymin=-4.0)
pages.append(f"""<div class="page"><div class="cut">{svg2}
<p class="note">One straight line through every velocity point from all 9 runs: g = {-m2:.3f} ± {al['L8'].value:.3f} m/s²
(standard error of the slope).</p></div></div>""")

# 6. Air resistance check
sm = wb['Summary']
trs = ''
for i, n in enumerate(runs):
    w = wb[f'Run {n}']
    trs += f'<tr><td>{n}</td><td>{w["J9"].value:.2f}</td><td>{w["J10"].value:.2f}</td></tr>'
first = np.mean([wb[f'Run {n}']['J9'].value for n in runs]); second = np.mean([wb[f'Run {n}']['J10'].value for n in runs])
pages.append(f"""<div class="page"><div class="cut" style="width:60%">
<h2>Air resistance check</h2>
<p class="note">g from the first half and the second half of each fall (slope of each half of the velocity–time data).</p>
<table style="font-size:11pt"><tr><th>Run #</th><th>g, first half (m/s²)</th><th>g, second half (m/s²)</th></tr>{trs}
<tr><td><b>Mean</b></td><td><b>{first:.2f}</b></td><td><b>{second:.2f}</b></td></tr></table></div></div>""")

html = f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>{"".join(pages)}</body></html>'
(OUTDIR / 'print_pack.html').write_text(html)

from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    # Use the preinstalled Chromium if it's there.
    exe = '/opt/pw-browsers/chromium'
    br = p.chromium.launch(executable_path=exe) if Path(exe).exists() else p.chromium.launch()
    pg = br.new_page()
    pg.set_content(html)
    pg.pdf(path=str(OUTDIR / 'Lab_Book_Print_Pack_George.pdf'), format='Letter', print_background=True)
    br.close()
print('saved', OUTDIR / 'Lab_Book_Print_Pack_George.pdf', '| example run slope', round(m, 4), 'R²', round(r2, 4),
      '| combined', round(-m2, 4))
