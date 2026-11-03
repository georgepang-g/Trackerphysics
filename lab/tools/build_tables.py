"""
Make a separate workbook with one big, printable table per run, from the analysis workbook.

    python3 lab/tools/build_tables.py lab/Experiment2_Gravity_George.xlsx lab/Experiment2_Data_Tables_George.xlsx

Time and height are copied as values from the analysis workbook (which must be recalculated first);
smoothed height, average velocity and g are formulas, so the sheet stands on its own.
"""
import sys
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

src, out = sys.argv[1], sys.argv[2]
a = load_workbook(src, data_only=True)
FONT = 'Arial'
f_body = Font(name=FONT, size=12)
f_input = Font(name=FONT, size=12, color='0000FF')
f_head = Font(name=FONT, size=12, bold=True, color='FFFFFF')
f_title = Font(name=FONT, size=16, bold=True)
f_bold = Font(name=FONT, size=12, bold=True)
f_note = Font(name=FONT, size=10, italic=True, color='555555')
fill_head = PatternFill('solid', fgColor='1F4E79')
fill_band = PatternFill('solid', fgColor='F2F6FA')
fill_result = PatternFill('solid', fgColor='E2EFDA')
thin = Side(style='thin', color='A6A6A6')
box = Border(left=thin, right=thin, top=thin, bottom=thin)
center = Alignment(horizontal='center', vertical='center', wrap_text=True)

wb = Workbook()
wb.remove(wb.active)
runs = [n for n in a.sheetnames if n.startswith('Run ')]
for name in runs:
    s = a[name]
    video = s['A1'].value.split('—')[-1].strip().replace('.MOV', '')
    ws = wb.create_sheet(f'{name} ({video})')
    ws['A1'] = f'{name} — {video}'
    ws['A1'].font = f_title
    ws['A2'] = ('Time from the last frame before the ball falls (120 fps). Height = bottom of the ball above the stand. '
                'Smoothed height = average of each height and its two neighbours. Average velocity = (HS(i+1) − HS(i)) / Δt.')
    ws['A2'].font = f_note
    ws['A2'].alignment = Alignment(wrap_text=True, vertical='top')
    ws.merge_cells('A2:F3')
    ws.row_dimensions[2].height = 30
    heads = ['', 'Frame', 'Time (s)', 'Height (m)', 'Smoothed height (m)', 'Average velocity (m/s)']
    hr = 4
    for j, h in enumerate(heads, start=1):
        c = ws.cell(hr, j, h); c.font = f_head; c.fill = fill_head; c.alignment = center; c.border = box
    ws.row_dimensions[hr].height = 32
    rows = []
    r = 5
    while s.cell(r, 1).value is not None:
        rows.append((s.cell(r, 1).value, s.cell(r, 3).value, s.cell(r, 5).value))
        r += 1
    first = hr + 1
    last = first + len(rows) - 1
    for k, (frame, t, h) in enumerate(rows):
        rr = first + k
        ws.cell(rr, 1, f't{k + 1}').font = f_body
        ws.cell(rr, 2, frame).font = f_body
        c = ws.cell(rr, 3, t); c.font = f_input; c.number_format = '0.0000'
        c = ws.cell(rr, 4, h); c.font = f_input; c.number_format = '0.0000'
        if first < rr < last:
            c = ws.cell(rr, 5, f'=AVERAGE(D{rr - 1}:D{rr + 1})'); c.number_format = '0.0000'; c.font = f_body
        if first < rr < last - 1:
            c = ws.cell(rr, 6, f'=(E{rr + 1}-E{rr})/(C{rr + 1}-C{rr})'); c.number_format = '0.000'; c.font = f_body
        for col in range(1, 7):
            cell = ws.cell(rr, col); cell.border = box
            cell.alignment = Alignment(horizontal='center')
            if k % 2: cell.fill = fill_band
    v1, v2 = first + 1, last - 2
    ws['H4'] = 'Result'; ws['H4'].font = f_bold
    for i, (label, formula, fmt) in enumerate([
        ('g = −slope of velocity vs time (m/s²)', f'=-SLOPE(F{v1}:F{v2},C{v1}:C{v2})', '0.000'),
        ('R² of the straight line', f'=RSQ(F{v1}:F{v2},C{v1}:C{v2})', '0.0000'),
        ('Number of rows', f'=COUNT(D{first}:D{last})', '0'),
        ('Fall time to the last row (s)', f'=C{last}', '0.000'),
    ], start=5):
        ws.cell(i, 8, label).font = f_body
        c = ws.cell(i, 9, formula); c.number_format = fmt; c.border = box
        c.font = f_bold if i == 5 else f_body
        if i == 5: c.fill = fill_result
    ws['H10'] = 'Blue = measured (from the videos). Black = calculated.'
    ws['H10'].font = f_note
    for col, w in zip('ABCDEFGHI', (6, 9, 12, 13, 15, 16, 3, 38, 12)):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = 'A5'
    ws.print_title_rows = '4:4'
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.print_area = f'A1:F{last}'
wb.save(out)
print('saved', out, len(runs), 'sheets')
