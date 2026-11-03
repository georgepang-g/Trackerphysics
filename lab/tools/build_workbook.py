"""
Build the Excel workbook for Experiment 2 (gravitational acceleration) from the analysed drops.

    python3 lab/tools/build_workbook.py lab/data/runs_120fps.json lab/Experiment2_Gravity_George.xlsx [EXCLUDE ...]

Input is the output of hi_analyze.py. Runs named in EXCLUDE (e.g. IMG_3041, a duplicate clip) are left out.
Follows the lab manual's Tasks 4-6: per run a time column, height, 3-point smoothed height, average
velocity, and a velocity-time graph whose trendline slope is -g; then a table of g with mean and SD.
Everything downstream of the measured positions and frame times is an Excel formula, so changing the drop
height on the Setup sheet updates every result.
"""
import json
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import Reference, ScatterChart, Series
from openpyxl.chart.data_source import NumFmt
from openpyxl.chart.trendline import Trendline, TrendlineLabel
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
EXCLUDE = set(sys.argv[3:])
data = json.loads(SRC.read_text())
runs = [r for r in data['runs'] if r['name'] not in EXCLUDE]

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
box = Border(left=thin, right=thin, top=thin, bottom=thin)
center = Alignment(horizontal='center', vertical='center', wrap_text=True)
RUN_COLOURS = ['1F4E79', 'C55A11', '548235', '7030A0', 'BF8F00', 'C00000', '2E75B6', '808080', '00B0F0', 'FF66CC']


def style_points(series, colour, size=5):
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


def header(ws, row, col, titles):
    for j, h in enumerate(titles):
        c = ws.cell(row, col + j, h); c.font = f_head; c.fill = fill_head; c.alignment = center; c.border = box


wb = Workbook()

# ---------------------------------------------------------------- Setup
st = wb.active
st.title = 'Setup'
st['A1'] = 'Experiment 2: Gravitational Acceleration — setup and calibration'
st['A1'].font = f_title
inputs = [
    ('Drop height h (bottom of ball to the stand)', data['H_drop'], 'm', 'Measured: 82.5 cm from the bottom of the ball to the base plate it lands on.', 'H'),
    ('Real-time factor (filmed fps ÷ playback fps)', 1, '', 'The videos were filmed at 120 fps and play in real time, so 1. (The manual\'s 960 fps example uses 32.)', 'factor'),
    ('Accepted value of g', 9.81, 'm/s²', 'Value given in the lab manual (section 7.2).', 'gref'),
]
names = {}
for i, (label, val, unit, note, key) in enumerate(inputs, start=3):
    st.cell(i, 1, label).font = f_body
    c = st.cell(i, 2, val); c.font = f_input; c.fill = fill_input; c.border = box
    st.cell(i, 3, unit).font = f_body
    st.cell(i, 4, note).font = f_note
    names[key] = f'Setup!$B${i}'
st['B3'].number_format = '0.000'
st['A7'] = 'Camera: iPhone, 3840×2160, 120 frames per second in real time. Times are each frame\'s own timestamp from the video file.'
st['A7'].font = f_note

r0 = 10
st.cell(r0 - 1, 1, 'Calibration: pixels per metre from the 82.5 cm drop').font = f_bold
st.cell(r0 - 1, 4, 'The ball centre moves exactly h from rest until the ball touches the stand. Touchdown is where the falling '
                   'and rebounding paths meet (both fitted). Pixel positions are in the full 3840×2160 frame.').font = f_note
header(st, r0, 1, ['Run', 'Video', 'Ball centre at rest y (px)', 'Ball centre at touchdown y (px)', 'Drop (px)', 'Scale (px/m)'])
first_cal = r0 + 1
cal_row = {}
for k, r in enumerate(runs):
    row = first_cal + k
    cal_row[r['name']] = row
    st.cell(row, 1, k + 1).font = f_body
    st.cell(row, 2, r['name']).font = f_body
    for col, val in ((3, r['y_rest']), (4, r['y_contact'])):
        c = st.cell(row, col, round(val, 1)); c.font = f_input; c.number_format = '0.0'
    st.cell(row, 5, f'=D{row}-C{row}').number_format = '0.0'
    st.cell(row, 6, f'=E{row}/{names["H"]}').number_format = '0.0'
    for col in range(1, 7):
        st.cell(row, col).border = box
        if col in (5, 6): st.cell(row, col).font = f_body
last_cal = first_cal + len(runs) - 1
row = last_cal + 1
st.cell(row, 1, 'Mean scale used for every run').font = f_bold
c = st.cell(row, 6, f'=AVERAGE(F{first_cal}:F{last_cal})'); c.font = f_bold; c.number_format = '0.0'; c.fill = fill_result; c.border = box
names['scale'] = f'Setup!$F${row}'
st.cell(row + 1, 1, 'Standard deviation of the scale').font = f_body
st.cell(row + 1, 6, f'=STDEV(F{first_cal}:F{last_cal})').number_format = '0.0'
st.cell(row + 2, 1, 'Uncertainty of the mean scale (SD ÷ √n)').font = f_body
st.cell(row + 2, 6, f'=F{row + 1}/SQRT(COUNT(F{first_cal}:F{last_cal}))').number_format = '0.0'
st.cell(row + 3, 1, 'Relative uncertainty of the scale').font = f_body
st.cell(row + 3, 6, f'=F{row + 2}/F{row}').number_format = '0.00%'
names['scale_rel'] = f'Setup!$F${row + 3}'
st.cell(row + 1, 4, 'The camera did not move between drops, so one mean scale is more reliable than each run\'s own.').font = f_note

legend = row + 6
st.cell(legend, 1, 'How to read this workbook').font = f_bold
for i, line in enumerate([
    'Blue text = measured values (from the videos) and inputs you can change. Black = formulas. Green = links to another sheet.',
    'Run sheets follow the lab manual, Task 4: T, TADJ, H, HS (3-point smoothed), Vav = (HS(i+1) − HS(i)) / Δt.',
    'Each run\'s graph is Vav against TADJ with a linear trendline (Task 5). Its slope is −g.',
    'Summary: table of g for every run, mean, standard deviation and % error (Task 6). Data tables: printable time and position tables.',
    'Ball positions were measured by tracking the green ball in every frame; the positions were checked by eye on the frames.',
    'IMG_3041 is not used: it is a second, shorter copy of the same drop as IMG_3055 (identical positions in every frame).',
], start=1):
    st.cell(legend + i, 1, line).font = f_note
for col, w in zip('ABCDEF', (44, 12, 16, 18, 12, 13)):
    st.column_dimensions[col].width = w

# ---------------------------------------------------------------- Run sheets
results = []          # (run number, sheet title, video name, number of data rows)
for k, r in enumerate(runs):
    n = k + 1
    ws = wb.create_sheet(f'Run {n}')
    rows = r['rows']
    ws['A1'] = f'Run {n} — {r["name"]}.MOV'
    ws['A1'].font = f_title
    ws['A2'] = (f't = 0 at frame {r["release_frame"]}, the last frame before the ball starts to fall. Last row: frame '
                f'{r["bottom_frame"] - 1}, the frame before the ball touches the stand. T is each frame\'s timestamp in the '
                f'video; y is the ball centre in pixels (down = positive).')
    ws['A2'].font = f_note
    hr = 4
    header(ws, hr, 1, ['Frame', 'T (s)', 'TADJ (s)', 'y (px)', 'H (m)', 'HS (m)', 'Vav (m/s)'])
    first = hr + 1
    last = first + len(rows) - 1
    for j, p in enumerate(rows):
        rr = first + j
        ws.cell(rr, 1, p['frame']).font = f_input
        c = ws.cell(rr, 2, round(p['t'], 6)); c.font = f_input; c.number_format = '0.0000'
        ws.cell(rr, 3, f'=(B{rr}-$B${first})*{names["factor"]}').number_format = '0.0000'
        c = ws.cell(rr, 4, round(p['y'], 1)); c.font = f_input; c.number_format = '0.0'
        # Height of the bottom of the ball above the stand: h at rest, minus the distance fallen.
        ws.cell(rr, 5, f'={names["H"]}-(D{rr}-Setup!$C${cal_row[r["name"]]})/{names["scale"]}').number_format = '0.0000'
        if first < rr < last:
            ws.cell(rr, 6, f'=(E{rr - 1}+E{rr}+E{rr + 1})/3').number_format = '0.0000'
        if first < rr < last - 1:
            ws.cell(rr, 7, f'=(F{rr + 1}-F{rr})/(C{rr + 1}-C{rr})').number_format = '0.000'
        for col in range(1, 8):
            ws.cell(rr, col).border = box
            if col in (3, 5, 6, 7): ws.cell(rr, col).font = f_body
    v_first, v_last = first + 1, last - 2
    half = (v_last - v_first) // 2
    rb = 4
    ws.cell(rb, 9, 'Result for this run').font = f_bold
    res = [
        ('Trendline slope of Vav vs TADJ (m/s²)', f'=SLOPE(G{v_first}:G{v_last},C{v_first}:C{v_last})', '0.000'),
        ('g = −slope (m/s²)', f'=-J{rb + 1}', '0.000'),
        ('R² of the trendline', f'=RSQ(G{v_first}:G{v_last},C{v_first}:C{v_last})', '0.0000'),
        ('Number of velocity points', f'=COUNT(G{v_first}:G{v_last})', '0'),
        ('g from the first half of the fall (m/s²)', f'=-SLOPE(G{v_first}:G{v_first + half},C{v_first}:C{v_first + half})', '0.000'),
        ('g from the second half of the fall (m/s²)', f'=-SLOPE(G{v_last - half}:G{v_last},C{v_last - half}:C{v_last})', '0.000'),
        ('Fall time, release to the last frame before touchdown (s)', f'=C{last}', '0.0000'),
    ]
    for i, (label, formula, fmt) in enumerate(res, start=1):
        ws.cell(rb + i, 9, label).font = f_body
        c = ws.cell(rb + i, 10, formula); c.number_format = fmt; c.border = box
        c.font = f_bold if i == 2 else f_body
        if i == 2: c.fill = fill_result
    ws.cell(rb + 9, 9, 'Vav uses the manual\'s formula (HS(i+1) − HS(i))/Δt, the speed halfway between two frames. Plotting it '
                       'at TADJ(i) shifts the line sideways by Δt/2 but does not change its slope.').font = f_note
    ws.cell(rb + 10, 9, 'The two halves check for air resistance: drag grows with speed, so the second half should show a '
                        'smaller acceleration.').font = f_note
    ch = ScatterChart()
    ch.title = f'Average velocity vs adjusted time — run {n}'
    ch.style = 13
    style_axes(ch)
    ch.legend = None
    se = Series(Reference(ws, min_col=7, min_row=v_first, max_row=v_last),
                Reference(ws, min_col=3, min_row=v_first, max_row=v_last), title=f'Run {n}')
    style_points(se, RUN_COLOURS[0])
    se.trendline = Trendline(trendlineType='linear', dispEq=True, dispRSqr=True,
                             trendlineLbl=TrendlineLabel(numFmt=NumFmt(formatCode='0.000', sourceLinked=False)))
    ch.series.append(se)
    ch.height, ch.width = 8.5, 15
    ws.add_chart(ch, 'I16')
    for col, w in zip('ABCDEFG', (8, 10, 10, 9, 10, 10, 11)):
        ws.column_dimensions[col].width = w
    ws.column_dimensions['I'].width = 50
    ws.column_dimensions['J'].width = 11
    ws.freeze_panes = 'A5'
    results.append((n, ws.title, r['name'], len(rows), v_first, v_last))

# ---------------------------------------------------------------- Summary
sm = wb.create_sheet('Summary', 1)
sm['A1'] = 'Experiment 2: acceleration due to gravity — results'
sm['A1'].font = f_title
sm['A2'] = 'Task 6: g for each run (from the slope of its Vav vs TADJ trendline), then the mean and standard deviation.'
sm['A2'].font = f_note
hr = 4
header(sm, hr, 1, ['Run', 'Video', 'g (m/s²)', 'R²', 'Velocity points', 'g, first half (m/s²)', 'g, second half (m/s²)', 'Fall time (s)'])
first = hr + 1
for k, (n, title, name, _, _, _) in enumerate(results):
    rr = first + k
    sm.cell(rr, 1, n).font = f_body
    sm.cell(rr, 2, name).font = f_body
    for col, ref, fmt in ((3, 'J6', '0.000'), (4, 'J7', '0.0000'), (5, 'J8', '0'), (6, 'J9', '0.000'), (7, 'J10', '0.000'), (8, 'J11', '0.000')):
        c = sm.cell(rr, col, f"='{title}'!{ref}"); c.font = f_link; c.number_format = fmt
    for col in range(1, 9):
        sm.cell(rr, col).border = box
last = first + len(results) - 1
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
    'Every run gives g below 9.81, and the second half of the fall gives less than the first half (compare the two means '
    'above): air resistance on this light ball with holes grows with speed and reduces its acceleration.',
    'Videos: 120 frames per second, so each run has about 48 positions and 45 velocity points.',
], start=0):
    sm.cell(note_r + i, 1, line).font = f_note
ch = ScatterChart()
ch.title = 'Average velocity vs adjusted time — all runs'
ch.style = 13
style_axes(ch)
for n, title, name, nrows, v_first, v_last in results:
    ws = wb[title]
    se = Series(Reference(ws, min_col=7, min_row=v_first, max_row=v_last), Reference(ws, min_col=3, min_row=v_first, max_row=v_last), title=title)
    style_points(se, RUN_COLOURS[(n - 1) % len(RUN_COLOURS)], 4)
    ch.series.append(se)
ch.height, ch.width = 10, 17
sm.add_chart(ch, 'J4')
for col, w in zip('ABCDEFGH', (28, 12, 11, 10, 12, 16, 17, 12)):
    sm.column_dimensions[col].width = w

# ---------------------------------------------------------------- Data tables (printable, one block per run)
dt = wb.create_sheet('Data tables', 2)
dt['A1'] = 'Recorded data for each run'
dt['A1'].font = f_title
dt['A2'] = ('Time from the last frame before the ball starts to fall (120 fps). Height = bottom of the ball above the stand. '
            'Smoothed height = average of each height and its two neighbours. Average velocity = (HS(i+1) − HS(i))/Δt. '
            'Values are linked to the run sheets.')
dt['A2'].font = f_note
titles = ['', 'Time (s)', 'Height (m)', 'Smoothed height (m)', 'Average velocity (m/s)']
longest = max(nrows for _, _, _, nrows, _, _ in results)
for idx, (n, title, name, nrows, _, _) in enumerate(results):
    c0 = 1 if idx % 2 == 0 else 7
    r0 = 4 + (idx // 2) * (longest + 4)
    dt.cell(r0, c0, f'Run {n} ({name})').font = f_bold
    header(dt, r0 + 1, c0, titles)
    for k in range(nrows):
        src = 5 + k
        rr = r0 + 2 + k
        dt.cell(rr, c0, f't{k + 1}').font = f_body
        for j, col in enumerate('CEFG', start=1):
            ref = f"'{title}'!{col}{src}"
            formula = f'={ref}' if col in 'CE' else f'=IF({ref}="","",{ref})'
            c = dt.cell(rr, c0 + j, formula); c.font = f_link; c.number_format = '0.000' if col != 'C' else '0.0000'
        for j in range(5):
            dt.cell(rr, c0 + j).border = box
for col, w in zip('ABCDEFGHIJK', (5, 10, 11, 13, 14, 3, 5, 10, 11, 13, 14)):
    dt.column_dimensions[col].width = w
dt.sheet_properties.pageSetUpPr.fitToPage = True
dt.page_setup.fitToWidth = 1
dt.page_setup.fitToHeight = 0

# ---------------------------------------------------------------- All runs combined (pooled data, one fit)
al = wb.create_sheet('All runs', 2)
al['A1'] = 'All runs combined: every frame of all runs in one data set'
al['A1'].font = f_title
al['A2'] = ('Pooling the runs gives one fit through several hundred points, which shrinks the random (scatter) part of the '
            'uncertainty. It does not remove systematic effects such as air resistance. Values are linked to the run sheets.')
al['A2'].font = f_note
hr = 4
header(al, hr, 1, ['Run', 'Video', 'TADJ (s)', 't² (s²)', 'Distance fallen d (m)'])
header(al, hr, 7, ['Run', 'TADJ (s)', 'Vav (m/s)'])
pr = vr = hr + 1
for n, title, name, nrows, v_first, v_last in results:
    for src in range(5, 5 + nrows):                       # every position
        al.cell(pr, 1, n).font = f_body
        al.cell(pr, 2, name).font = f_body
        c = al.cell(pr, 3, f"='{title}'!C{src}"); c.font = f_link; c.number_format = '0.0000'
        al.cell(pr, 4, f'=(C{pr}-$L$16)^2').number_format = '0.00000'
        c = al.cell(pr, 5, f"={names['H']}-'{title}'!E{src}"); c.font = f_link; c.number_format = '0.0000'
        for col in range(1, 6): al.cell(pr, col).border = box
        pr += 1
    for src in range(v_first, v_last + 1):                # every velocity
        al.cell(vr, 7, n).font = f_body
        c = al.cell(vr, 8, f"='{title}'!C{src}"); c.font = f_link; c.number_format = '0.0000'
        c = al.cell(vr, 9, f"='{title}'!G{src}"); c.font = f_link; c.number_format = '0.000'
        for col in range(7, 10): al.cell(vr, col).border = box
        vr += 1
p1, p2, q1, q2 = hr + 1, pr - 1, hr + 1, vr - 1
Y, X = f'I{q1}:I{q2}', f'H{q1}:H{q2}'
D, T2 = f'E{p1}:E{p2}', f'D{p1}:D{p2}'
al['K4'] = 'Combined results'; al['K4'].font = f_bold
combined = [
    ('Velocity vs time (manual, Task 5)', None, None),
    ('Number of velocity points', f'=COUNT({Y})', '0'),
    ('g = −slope (m/s²)', f'=-SLOPE({Y},{X})', '0.000'),
    ('Standard error of g (m/s²)', f'=INDEX(LINEST({Y},{X},TRUE,TRUE),2,1)', '0.000'),
    ('R²', f'=RSQ({Y},{X})', '0.0000'),
    ('Distance fallen vs t² (manual, theory: d = ½gt²)', None, None),
    ('Number of positions', f'=COUNT({D})', '0'),
    ('g = 2 × slope (m/s²)', f'=2*SLOPE({D},{T2})', '0.000'),
    ('Standard error of g (m/s²)', f'=2*INDEX(LINEST({D},{T2},TRUE,TRUE),2,1)', '0.000'),
    ('R²', f'=RSQ({D},{T2})', '0.0000'),
    ('For comparison: mean of the 9 separate runs (m/s²)', f"=Summary!C{last + 3}", '0.000'),
]
for i, (label, formula, fmt) in enumerate(combined, start=5):
    cl = al.cell(i, 11, label)
    if formula is None:
        cl.font = f_bold
        continue
    cl.font = f_body
    c = al.cell(i, 12, formula); c.number_format = fmt; c.border = box
    if label.startswith('g ='):
        c.font = f_bold; c.fill = fill_result
    else:
        c.font = f_link if 'Summary' in formula else f_body
al.cell(16, 11, 'Shift of t = 0 used for the d–t² graph (s)').font = f_body
c = al.cell(16, 12, 0); c.font = f_input; c.fill = fill_input; c.border = box; c.number_format = '0.000'
al.cell(17, 11, 'The velocity–time slope does not depend on where t = 0 is, so it is the main result. The d–t² slope does: '
                'the ball was let go somewhere within one frame (0.008 s) after t = 0, and shifting t = 0 across that frame '
                'changes this g by about 0.35 m/s². Try 0.004 in the yellow cell.').font = f_note
al.cell(18, 11, 'So the d–t² standard error above understates its real uncertainty (about ±0.2 m/s² from the release '
                'timing). Air resistance lowers both slopes; see the Summary sheet.').font = f_note
for (anchor, title_, xref, yref, xt, yt, xf) in (
        ('K20', f'Average velocity vs adjusted time — all runs ({q2 - q1 + 1} points)', (8, q1, q2), (9, q1, q2), 'TADJ (s)', 'Vav (m/s)', '0.00'),
        ('K40', f'Distance fallen vs time squared — all runs ({p2 - p1 + 1} points)', (4, p1, p2), (5, p1, p2), 't² (s²)', 'd (m)', '0.00')):
    ch = ScatterChart()
    ch.title = title_
    ch.style = 13
    ch.x_axis.title = xt; ch.y_axis.title = yt
    ch.x_axis.number_format = xf; ch.y_axis.number_format = '0.0'
    ch.x_axis.delete = False; ch.y_axis.delete = False
    ch.x_axis.tickLblPos = 'low'
    ch.legend = None
    se = Series(Reference(al, min_col=yref[0], min_row=yref[1], max_row=yref[2]),
                Reference(al, min_col=xref[0], min_row=xref[1], max_row=xref[2]), title='All runs')
    style_points(se, RUN_COLOURS[0], 3)
    se.trendline = Trendline(trendlineType='linear', dispEq=True, dispRSqr=True,
                             trendlineLbl=TrendlineLabel(numFmt=NumFmt(formatCode='0.000', sourceLinked=False)))
    ch.series.append(se)
    ch.height, ch.width = 9.5, 17
    al.add_chart(ch, anchor)
for col, w in zip('ABCDEFGHIJKL', (6, 11, 10, 10, 13, 3, 6, 10, 10, 3, 46, 11)):
    al.column_dimensions[col].width = w
al.freeze_panes = 'A5'

wb.save(OUT)
print('saved', OUT, 'with', len(runs), 'runs')
