"""
Build the Excel workbook for Experiment 2 (gravitational acceleration) from the tracked ball positions.

    python3 lab/tools/build_workbook.py lab/data lab/Experiment2_Gravity_George.xlsx

Follows the lab manual's Tasks 4-6: per run a time column, height, 3-point smoothed height, average
velocity, and a velocity-time graph whose trendline slope is -g; then a table of g with mean and SD.
Everything downstream of the measured positions is an Excel formula, so changing the frame rate, drop
height or scale on the Setup sheet updates every result.
"""
import json
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import Reference, ScatterChart, Series
from openpyxl.chart.data_source import NumFmt
from openpyxl.chart.trendline import Trendline, TrendlineLabel
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

DATA, OUT = Path(sys.argv[1]), Path(sys.argv[2])
VIDEO_IDS = {1: 'dc95a2e9', 2: 'e8377417', 3: 'ca6e7598', 4: 'ba985988', 5: '1f8cb790', 6: '37e4371a'}

FONT = 'Arial'
f_body = Font(name=FONT, size=10)
f_input = Font(name=FONT, size=10, color='0000FF')
f_link = Font(name=FONT, size=10, color='008000')
f_bold = Font(name=FONT, size=10, bold=True)
f_head = Font(name=FONT, size=10, bold=True, color='FFFFFF')
f_title = Font(name=FONT, size=14, bold=True)
f_note = Font(name=FONT, size=9, italic=True, color='555555')
fill_head = PatternFill('solid', fgColor='1F4E79')
fill_input = PatternFill('solid', fgColor='FFF2CC')
fill_result = PatternFill('solid', fgColor='E2EFDA')
thin = Side(style='thin', color='BFBFBF')
RUN_COLOURS = ['1F4E79', 'C55A11', '548235', '7030A0', 'BF8F00', 'C00000', '2E75B6', '808080', '00B0F0', 'FF66CC']


def style_points(series, colour, size=6):
    series.marker.symbol = 'circle'
    series.marker.size = size
    series.marker.graphicalProperties.solidFill = colour
    series.marker.graphicalProperties.line.solidFill = colour
    series.graphicalProperties.line.noFill = True


def style_axes(chart):
    chart.x_axis.title = 'TADJ (s)'
    chart.y_axis.title = 'Vav (m/s)'
    chart.x_axis.number_format = '0.00'
    chart.y_axis.number_format = '0.0'
    chart.x_axis.delete = False
    chart.y_axis.delete = False
    chart.x_axis.tickLblPos = 'low'      # velocities are negative: keep the time labels at the bottom
box = Border(left=thin, right=thin, top=thin, bottom=thin)
center = Alignment(horizontal='center', vertical='center', wrap_text=True)

fits = {r['video']: r for r in json.loads((DATA / 'fits_px.json').read_text())}
calib = {c['video']: c for c in json.loads((DATA / 'calibration.json').read_text())}
runs = sorted(fits)

wb = Workbook()

# ---------------------------------------------------------------- Setup
st = wb.active
st.title = 'Setup'
st['A1'] = 'Experiment 2: Gravitational Acceleration — setup and calibration'
st['A1'].font = f_title
rows = [
    ('Frame rate of the video files', 30, 'fps', 'User: analyse the videos at 30 fps. The clips play in real time.', 'fps'),
    ('Real-time factor (filmed fps ÷ playback fps)', 1, '', 'Clips play at real speed, so 1. For slow motion use filmed ÷ playback, e.g. 960/30 = 32 in the manual.', 'factor'),
    ('Drop height h (bottom of ball to the stand)', 0.825, 'm', 'User measurement: 82.5 cm from the bottom of the ball to the base plate it lands on.', 'H'),
    ('Accepted value of g', 9.81, 'm/s²', 'Value given in the lab manual (section 7.2).', 'gref'),
]
names = {}
for i, (label, val, unit, note, key) in enumerate(rows, start=3):
    st.cell(i, 1, label).font = f_body
    c = st.cell(i, 2, val); c.font = f_input; c.fill = fill_input; c.border = box
    st.cell(i, 3, unit).font = f_body
    st.cell(i, 4, note).font = f_note
    names[key] = f"Setup!$B${i}"
st['B5'].number_format = '0.000'

r0 = 9
st.cell(r0 - 1, 1, 'Calibration: pixels per metre from the 82.5 cm drop').font = f_bold
st.cell(r0 - 1, 4, 'The ball centre moves exactly h from rest until the ball touches the stand. Touchdown is where the '
                   'falling and rebounding paths meet (found by fitting both). Positions are in a 640-px-wide frame '
                   '(videos 2 and 4 were 960 px wide and were scaled by 2/3).').font = f_note
hdr = ['Run', 'Ball centre at rest y (px)', 'Ball centre at touchdown y (px)', 'Drop (px)', 'Scale (px/m)']
for j, h in enumerate(hdr, start=1):
    c = st.cell(r0, j, h); c.font = f_head; c.fill = fill_head; c.alignment = center; c.border = box
first_cal = r0 + 1
for k, v in enumerate(runs):
    r = first_cal + k
    s = 640 / calib[v]['W']
    st.cell(r, 1, v).font = f_body
    for col, val in ((2, calib[v]['y_rest'] * s), (3, calib[v]['y_contact'] * s)):
        c = st.cell(r, col, round(val, 2)); c.font = f_input; c.number_format = '0.00'
    st.cell(r, 4, f'=C{r}-B{r}').number_format = '0.0'
    st.cell(r, 5, f'=D{r}/{names["H"]}').number_format = '0.0'
    for col in range(1, 6):
        st.cell(r, col).border = box
        if col in (1, 4, 5): st.cell(r, col).font = f_body
last_cal = first_cal + len(runs) - 1
r = last_cal + 1
st.cell(r, 1, 'Mean scale used for every run').font = f_bold
c = st.cell(r, 5, f'=AVERAGE(E{first_cal}:E{last_cal})'); c.font = f_bold; c.number_format = '0.0'; c.fill = fill_result; c.border = box
names['scale'] = f'Setup!$E${r}'
st.cell(r + 1, 1, 'Standard deviation of the scale').font = f_body
st.cell(r + 1, 5, f'=STDEV(E{first_cal}:E{last_cal})').number_format = '0.0'
st.cell(r + 2, 1, 'Uncertainty of the mean scale (SD ÷ √n)').font = f_body
st.cell(r + 2, 5, f'=E{r + 1}/SQRT(COUNT(E{first_cal}:E{last_cal}))').number_format = '0.0'
st.cell(r + 3, 1, 'Relative uncertainty of the scale').font = f_body
st.cell(r + 3, 5, f'=E{r + 2}/E{r}').number_format = '0.0%'
names['scale_rel'] = f'Setup!$E${r + 3}'
st.cell(r + 1, 4, 'The camera did not move between clips, so one mean scale is more reliable than each run\'s own.').font = f_note

legend = r + 6
st.cell(legend, 1, 'How to read this workbook').font = f_bold
for i, line in enumerate([
    'Blue text on yellow = numbers you can change (inputs and measured positions). Black = formulas. Green = links to another sheet.',
    'Run sheets follow the lab manual, Task 4: T, TADJ, H, HS (3-point smoothed), Vav = (HS(i+1) − HS(i)) / Δt.',
    'Each run\'s graph is Vav against TADJ with a linear trendline (Task 5). Its slope is −g.',
    'Summary sheet: table of g for every run, mean, standard deviation and % error (Task 6).',
    'Ball positions were measured by tracking the green ball frame by frame and checked by eye on every frame.',
], start=1):
    st.cell(legend + i, 1, line).font = f_note
st.column_dimensions['A'].width = 44
for col, w in (('B', 18), ('C', 18), ('D', 14), ('E', 14)):
    st.column_dimensions[col].width = w
st.column_dimensions['D'].width = 14

# ---------------------------------------------------------------- Run sheets
summary_rows = []
for v in runs:
    ws = wb.create_sheet(f'Run {v}')
    d = json.loads((DATA / f'track_run{v}.json').read_text())
    s = 640 / d['W']
    fit = fits[v]
    pts = [t for t in d['track'] if not t.get('lost') and fit['release'] <= t['frame'] <= fit['bottom'] - 1]
    ws['A1'] = f'Run {v} — falling ball (video {VIDEO_IDS[v]}…, {d["W"]}×{d["H"]})'
    ws['A1'].font = f_title
    ws['A2'] = (f't = 0 at frame {fit["release"]}, the frame where the ball starts to move. Last row: frame {fit["bottom"] - 1}, '
                f'the frame before the ball touches the stand. y is the ball centre in pixels (down = positive, 640-px-wide frame).')
    ws['A2'].font = f_note
    heads = ['Frame', 'T (s)', 'TADJ (s)', 'y (px)', 'H (m)', 'HS (m)', 'Vav (m/s)']
    hr = 4
    for j, h in enumerate(heads, start=1):
        c = ws.cell(hr, j, h); c.font = f_head; c.fill = fill_head; c.alignment = center; c.border = box
    first = hr + 1
    last = first + len(pts) - 1
    for k, p in enumerate(pts):
        r = first + k
        ws.cell(r, 1, p['frame']).font = f_input
        ws.cell(r, 2, f'=A{r}/{names["fps"]}').number_format = '0.0000'
        ws.cell(r, 3, f'=(B{r}-$B${first})/{names["factor"]}').number_format = '0.0000'
        c = ws.cell(r, 4, round(p['y'] * s, 2)); c.font = f_input; c.number_format = '0.00'
        # Height of the ball's bottom above the stand: h at rest, minus the distance fallen.
        ws.cell(r, 5, f'={names["H"]}-(D{r}-Setup!$B${first_cal + runs.index(v)})/{names["scale"]}').number_format = '0.0000'
        if first < r < last:
            ws.cell(r, 6, f'=(E{r - 1}+E{r}+E{r + 1})/3').number_format = '0.0000'
        if first < r < last - 1:
            ws.cell(r, 7, f'=(F{r + 1}-F{r})/(C{r + 1}-C{r})').number_format = '0.000'
        for col in range(1, 8):
            ws.cell(r, col).border = box
            if col not in (1, 4): ws.cell(r, col).font = f_body
    v_first, v_last = first + 1, last - 2
    # Results block
    rb = 4
    ws.cell(rb, 9, 'Result for this run').font = f_bold
    res = [
        ('Trendline slope of Vav vs TADJ (m/s²)', f'=SLOPE(G{v_first}:G{v_last},C{v_first}:C{v_last})', '0.000'),
        ('g = −slope (m/s²)', f'=-J{rb + 1}', '0.000'),
        ('R² of the trendline', f'=RSQ(G{v_first}:G{v_last},C{v_first}:C{v_last})', '0.0000'),
        ('Number of velocity points', f'=COUNT(G{v_first}:G{v_last})', '0'),
        ('g from the first half of the fall (m/s²)', f'=-SLOPE(G{v_first}:G{v_first + (v_last - v_first) // 2},C{v_first}:C{v_first + (v_last - v_first) // 2})', '0.000'),
        ('g from the second half of the fall (m/s²)', f'=-SLOPE(G{v_last - (v_last - v_first) // 2}:G{v_last},C{v_last - (v_last - v_first) // 2}:C{v_last})', '0.000'),
    ]
    for i, (label, formula, fmt) in enumerate(res, start=1):
        ws.cell(rb + i, 9, label).font = f_body
        c = ws.cell(rb + i, 10, formula); c.number_format = fmt; c.border = box
        c.font = f_bold if i == 2 else f_body
        if i == 2: c.fill = fill_result
    ws.cell(rb + 8, 9, 'Vav uses the manual\'s formula (HS(i+1) − HS(i))/Δt, which is the speed halfway between two '
                       'frames. Plotting it at TADJ(i) shifts the line sideways by Δt/2 but does not change its slope.').font = f_note
    ws.cell(rb + 9, 9, 'The two halves are a check for air resistance: drag grows with speed, so the second half '
                       'should show a smaller acceleration.').font = f_note
    ch = ScatterChart()
    ch.title = f'Average velocity vs adjusted time — run {v}'
    style_axes(ch)
    ch.legend = None
    xs = Reference(ws, min_col=3, min_row=v_first, max_row=v_last)
    ys = Reference(ws, min_col=7, min_row=v_first, max_row=v_last)
    se = Series(ys, xs, title=f'Run {v}')
    style_points(se, RUN_COLOURS[0])
    se.trendline = Trendline(trendlineType='linear', dispEq=True, dispRSqr=True,
                             trendlineLbl=TrendlineLabel(numFmt=NumFmt(formatCode='0.000', sourceLinked=False)))
    ch.series.append(se)
    ch.height, ch.width = 8.5, 15
    ws.add_chart(ch, 'I15')
    for col, w in zip('ABCDEFG', (8, 9, 10, 9, 10, 10, 11)):
        ws.column_dimensions[col].width = w
    ws.column_dimensions['I'].width = 40
    ws.column_dimensions['J'].width = 11
    ws.freeze_panes = 'A5'
    summary_rows.append((v, ws.title, fit['release'], fit['bottom']))

# ---------------------------------------------------------------- Summary
sm = wb.create_sheet('Summary', 1)
sm['A1'] = 'Experiment 2: acceleration due to gravity — results'
sm['A1'].font = f_title
sm['A2'] = 'Task 6: g for each run (from the slope of its Vav vs TADJ trendline), then the mean and standard deviation.'
sm['A2'].font = f_note
heads = ['Run', 'Release frame', 'g (m/s²)', 'R²', 'Velocity points', 'g, first half (m/s²)', 'g, second half (m/s²)']
hr = 4
for j, h in enumerate(heads, start=1):
    c = sm.cell(hr, j, h); c.font = f_head; c.fill = fill_head; c.alignment = center; c.border = box
first = hr + 1
for k, (v, title, rel, bot) in enumerate(summary_rows):
    r = first + k
    sm.cell(r, 1, v).font = f_body
    sm.cell(r, 2, rel).font = f_input
    for col, ref, fmt in ((3, 'J6', '0.000'), (4, 'J7', '0.0000'), (5, 'J8', '0'), (6, 'J9', '0.000'), (7, 'J10', '0.000')):
        c = sm.cell(r, col, f"='{title}'!{ref}"); c.font = f_link; c.number_format = fmt
    for col in range(1, 8):
        sm.cell(r, col).border = box
last = first + len(summary_rows) - 1
r = last + 2
stats = [
    ('Number of runs, n', f'=COUNT(C{first}:C{last})', '0'),
    ('Mean g (m/s²)', f'=AVERAGE(C{first}:C{last})', '0.000'),
    ('Standard deviation σ (m/s²)', f'=STDEV(C{first}:C{last})', '0.000'),
    ('Uncertainty of the mean, σ/√n (m/s²)', f'=C{r + 2}/SQRT(C{r})', '0.000'),
    ('Scale (calibration) uncertainty in g (m/s²)', f'=C{r + 1}*{names["scale_rel"]}', '0.000'),
    ('Accepted value (m/s²)', f'={names["gref"]}', '0.00'),
    ('Percent error', f'=ABS(C{r + 1}-C{r + 5})/C{r + 5}', '0.0%'),
    ('Mean g, first half of the fall (m/s²)', f'=AVERAGE(F{first}:F{last})', '0.000'),
    ('Mean g, second half of the fall (m/s²)', f'=AVERAGE(G{first}:G{last})', '0.000'),
]
for i, (label, formula, fmt) in enumerate(stats):
    sm.cell(r + i, 1, label).font = f_body
    sm.merge_cells(start_row=r + i, start_column=1, end_row=r + i, end_column=2)
    c = sm.cell(r + i, 3, formula); c.number_format = fmt; c.border = box
    c.font = f_bold if i in (1, 2, 6) else f_body
    if i in (1, 2, 6): c.fill = fill_result
note_r = r + len(stats) + 1
for i, line in enumerate([
    'Result: g = mean ± σ (spread between runs). The uncertainty of the mean, σ/√n, is how well the mean itself is known.',
    'Every run gives g below 9.81, and on average the second half of the fall gives less than the first half (compare the '
    'two means above): air resistance on this light ball with holes grows with speed and reduces its acceleration.',
    'Videos were analysed at 30 fps (1/30 s between frames), so each run has about 11 positions and 8–9 velocity points.',
], start=0):
    sm.cell(note_r + i, 1, line).font = f_note

ch = ScatterChart()
ch.title = 'Average velocity vs adjusted time — all runs'
style_axes(ch)
for v, title, rel, bot in summary_rows:
    ws = wb[title]
    vf, vl = 6, 4 + (bot - 1 - rel + 1) - 2
    se = Series(Reference(ws, min_col=7, min_row=vf, max_row=vl), Reference(ws, min_col=3, min_row=vf, max_row=vl), title=title)
    style_points(se, RUN_COLOURS[(v - 1) % len(RUN_COLOURS)], 5)
    ch.series.append(se)
ch.height, ch.width = 9, 16
sm.add_chart(ch, 'I4')
for col, w in zip('ABCDEFG', (30, 14, 12, 10, 12, 16, 17)):
    sm.column_dimensions[col].width = w

wb.save(OUT)
print('saved', OUT)
