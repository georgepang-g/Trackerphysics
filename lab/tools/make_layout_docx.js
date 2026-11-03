// Lab book layout guide as a Word document: one page per lab book page, showing what to write by hand
// (blue), what to put in your own words (grey boxes) and where each print-pack item is glued.
//   node lab/tools/make_layout_docx.js ITEM_IMAGE_DIR OUT.docx
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  ShadingType, AlignmentType, LevelFormat, PageBreak, VerticalAlign,
} = require('docx');

const [imgDir, out] = process.argv.slice(2);
const FONT = 'Arial';
const INK = '1F3FBF';          // "write this by hand"
const W = 9360;                // content width, DXA (6.5 in)

const img = (n, widthPx) => {
  const file = path.join(imgDir, `item-${n}.png`);
  const buf = fs.readFileSync(file);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  return new ImageRun({ type: 'png', data: buf, transformation: { width: widthPx, height: Math.round(widthPx * h / w) } });
};
const t = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || 22, bold: o.bold, italics: o.italics,
  color: o.color, subScript: o.sub, underline: o.underline ? {} : undefined, highlight: o.highlight });
const ink = (text, o = {}) => t(text, { ...o, color: INK, size: o.size || 24 });
const p = (runs, o = {}) => new Paragraph({ children: Array.isArray(runs) ? runs : [runs], spacing: { after: o.after ?? 120, before: o.before ?? 0 },
  alignment: o.align, indent: o.indent ? { left: o.indent } : undefined, numbering: o.bullet ? { reference: 'bullets', level: 0 } : undefined });
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: none, bottom: none, left: none, right: none };

function pageBand(label, sub) {
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: W, type: WidthType.DXA }, borders: noBorders,
      shading: { type: ShadingType.CLEAR, fill: '1F4E79', color: 'auto' },
      margins: { top: 100, bottom: 100, left: 160, right: 160 },
      children: [p([t(label, { bold: true, color: 'FFFFFF', size: 28 }), t(sub ? `   ${sub}` : '', { color: 'DDE6F0', size: 20 })], { after: 0 })],
    })] })],
  });
}

function ownWords(title, bullets, bw = W) {
  return new Table({
    width: { size: bw, type: WidthType.DXA }, columnWidths: [bw],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: bw, type: WidthType.DXA },
      borders: { top: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' },
                 left: { style: BorderStyle.SINGLE, size: 24, color: '7F7F7F' }, right: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' } },
      shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
      margins: { top: 100, bottom: 60, left: 180, right: 160 },
      children: [p(t(title, { bold: true, size: 20, color: '404040' }), { after: 60 }),
                 ...bullets.map((b) => p(Array.isArray(b) ? b : t(b, { size: 20, color: '404040' }), { bullet: true, after: 40 }))],
    })] })],
  });
}

function glue(n, name, widthPx, bw = W) {
  const dashed = { style: BorderStyle.DASHED, size: 8, color: 'C55A11' };
  return new Table({
    width: { size: bw, type: WidthType.DXA }, columnWidths: [bw],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: bw, type: WidthType.DXA }, borders: { top: dashed, bottom: dashed, left: dashed, right: dashed },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [p(t(`✂  GLUE IN: print pack page ${n} — ${name}`, { bold: true, size: 18, color: 'C55A11' }), { after: 60 }),
                 p(img(n, widthPx), { align: AlignmentType.CENTER, after: 0 })],
    })] })],
  });
}

function boxed(runs) {
  const b = { style: BorderStyle.SINGLE, size: 12, color: INK };
  return new Table({
    width: { size: 4200, type: WidthType.DXA }, columnWidths: [4200],
    rows: [new TableRow({ children: [new TableCell({ width: { size: 4200, type: WidthType.DXA }, borders: { top: b, bottom: b, left: b, right: b },
      margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [p(runs, { after: 0 })] })] })],
  });
}

const gap = (after = 160) => new Paragraph({ children: [], spacing: { after } });
const heading = (text) => p(ink(text, { bold: true, size: 28, underline: true, highlight: 'yellow' }), { after: 160 });
const brk = () => new Paragraph({ children: [new PageBreak()] });

// ---------------------------------------------------------------- cover / checklist
const cover = [
  p(t('Lab Book Layout — Experiment 2: Gravitational Acceleration', { bold: true, size: 36 }), { after: 60 }),
  p(t('George · how to set out pages 5–10, following the same layout as Ryan\'s lab book', { size: 22, color: '595959' }), { after: 240 }),
  p(t('How to read this guide', { bold: true, size: 24 })),
  p([ink('Blue text', { bold: true, size: 22 }), t(' = write this in your lab book by hand (headings, calculations, results).')], { bullet: true }),
  p([t('Grey boxes', { bold: true }), t(' = the points to cover. Write these sentences in your own words.')], { bullet: true }),
  p([t('Orange dashed boxes', { bold: true, color: 'C55A11' }), t(' = cut out that page of the print pack and glue it in there.')], { bullet: true }),
  gap(200),
  p(t('What to print', { bold: true, size: 24 })),
  p(t('Print Lab_Book_Print_Pack_George.pdf (6 pages) and cut along the dashed boxes.', { size: 22 }), { after: 120 }),
];
const checklist = [
  ['1', 'Example of tracking the ball (Run 3)', 'Page 6'],
  ['2', 'Recorded data for Run 3 (full table)', 'Page 7'],
  ['3', 'Velocity vs time graph, Run 3', 'Page 8'],
  ['4', 'Value of g for each run (or copy by hand)', 'Page 9'],
  ['5', 'All 9 runs combined graph (extra)', 'Page 10'],
  ['6', 'Air resistance check table (extra)', 'Page 10'],
];
const cw = [1400, 5560, 2400];
const cell = (text, w, o = {}) => new TableCell({ width: { size: w, type: WidthType.DXA },
  shading: o.head ? { type: ShadingType.CLEAR, fill: '1F4E79', color: 'auto' } : undefined,
  margins: { top: 60, bottom: 60, left: 100, right: 100 }, verticalAlign: VerticalAlign.CENTER,
  children: [p(t(text, { bold: o.head, color: o.head ? 'FFFFFF' : undefined, size: 21 }), { after: 0, align: o.center ? AlignmentType.CENTER : undefined })] });
cover.push(new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: cw, rows: [
  new TableRow({ tableHeader: true, children: [cell('Print pack page', cw[0], { head: true, center: true }), cell('Item', cw[1], { head: true }), cell('Glue onto lab book', cw[2], { head: true })] }),
  ...checklist.map((r) => new TableRow({ children: [cell(r[0], cw[0], { center: true }), cell(r[1], cw[1]), cell(r[2], cw[2])] })),
] }));
cover.push(gap(200));
cover.push(p(t('Also save both Excel files (Experiment2_Gravity_George.xlsx and Experiment2_Data_Tables_George.xlsx) in your class computer folder for this lab — the lab book refers to them for the other 8 runs.', { size: 21 })));

// ---------------------------------------------------------------- page 5
const page5 = [
  pageBand('LAB BOOK — PAGE 5', 'Purpose · Apparatus · Procedure (group page, already written)'),
  gap(),
  p(t('This page is already done. Make two corrections:', { bold: true })),
  p([t('Purpose, the equation: change  '), t('h = v₀ + ½gt²', { size: 22 }), t('  to  '), ink('h = v₀t + ½gt²', { bold: true })], { bullet: true }),
  p([t('Procedure step 2: cross out "240 fps in slow-mo mode" and write  '), ink('120 fps (normal video)', { bold: true })], { bullet: true }),
];

// ---------------------------------------------------------------- page 6
const page6 = [
  pageBand('LAB BOOK — PAGE 6', 'Data Analysis'),
  gap(),
  heading('Data Analysis:'),
  ownWords('Write 2–3 sentences in your own words, including:', [
    'The videos were filmed at 120 frames per second, so frames are 0.0083 s apart.',
    'The position of the ball was measured in every frame by tracking its centre with a video-tracking program (be honest that it was not Tracker).',
    'The scale came from the drop height: 82.5 cm from the bottom of the ball to the base, measured with a metre stick.',
    'Time t = 0 is the last frame before the ball starts to fall.',
  ]),
  gap(200),
  glue(1, 'Example of tracking the ball (Run 3)', 600),
  p(ink('↑ label it: "Example of tracking (Run 3)"', { size: 22 }), { before: 80 }),
];

// ---------------------------------------------------------------- page 7 (table left, calculations right)
const sub = (s) => ink(s, { sub: true });
const calc = [
  p(ink('Recorded Data for Run #3', { bold: true, underline: true }), { after: 200 }),
  p(ink('Example of smoothed height for t₂', { bold: true }), { after: 60 }),
  p([ink('h'), sub('s2'), ink(' = (h'), sub('1'), ink(' + h'), sub('2'), ink(' + h'), sub('3'), ink(') / 3')]),
  p(ink('= (0.82496 + 0.82438 + 0.82257) / 3', { size: 21 })),
  boxed([ink('h'), sub('s2'), ink(' = 0.82397 m', { bold: true })]),
  p(ink('No hₛ at t₁ or t₅₁ because h₀ and h₅₂ don\'t exist.', { size: 20 }), { before: 80, after: 240 }),
  p(ink('Example of average velocity at t₂', { bold: true }), { after: 60 }),
  p([ink('v'), sub('2'), ink(' = (h'), sub('s3'), ink(' − h'), sub('s2'), ink(') / (t₃ − t₂)')]),
  p(ink('= (0.82267 − 0.82397) / (0.016667 − 0.008333)', { size: 21 })),
  boxed([ink('v'), sub('2'), ink(' = −0.156 m/s', { bold: true })]),
  p(ink('↑ extra decimal places from the spreadsheet; with the 3-decimal table values the rounding gives the wrong answer.', { size: 19, italics: true }), { before: 80 }),
  p(ink('No velocity at t₁, t₅₀ or t₅₁ because hₛ is missing there.', { size: 20 })),
];
const page7 = [
  pageBand('LAB BOOK — PAGE 7', 'Recorded data + example calculations'),
  gap(),
  new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [5200, 4160], rows: [new TableRow({ children: [
    new TableCell({ width: { size: 5200, type: WidthType.DXA }, borders: noBorders, children: [glue(2, 'Run 3 table', 320, 5000)] }),
    new TableCell({ width: { size: 4160, type: WidthType.DXA }, borders: noBorders, margins: { left: 200 }, children: calc }),
  ] })] }),
];

// ---------------------------------------------------------------- page 8
const page8 = [
  pageBand('LAB BOOK — PAGE 8', 'Graph + determining g'),
  gap(),
  glue(3, 'Velocity vs time graph, Run 3', 560),
  gap(200),
  p(ink('Data for the other 8 runs is in the Excel files (Experiment2_Gravity_George.xlsx) in the computer folder.', { size: 22 })),
  gap(120),
  heading('Determining constant g:'),
  p(ink('Within the velocity–time graph above, −g is given by the slope of the trendline.', { size: 22 })),
  p(ink('y = −8.8864x − 0.1275', { size: 24 }), { indent: 720 }),
  p(ink('−g = −8.8864', { size: 24 }), { indent: 720 }),
  p(ink('∴ g = 8.8864 m/s²', { size: 26, bold: true }), { indent: 720 }),
];

// ---------------------------------------------------------------- page 9
const runs = [
  ['1', 'y = −8.6225x − 0.2339', '0.9901', '8.6225'], ['2', 'y = −8.7772x − 0.1657', '0.9980', '8.7772'],
  ['3', 'y = −8.8864x − 0.1275', '0.9981', '8.8864'], ['4', 'y = −8.6806x − 0.1454', '0.9971', '8.6806'],
  ['5', 'y = −9.0588x − 0.1516', '0.9985', '9.0588'], ['6', 'y = −9.1246x − 0.0827', '0.9982', '9.1246'],
  ['7', 'y = −8.8489x − 0.2167', '0.9982', '8.8489'], ['8', 'y = −8.9518x − 0.1558', '0.9975', '8.9518'],
  ['9', 'y = −9.0938x − 0.2318', '0.9983', '9.0938'],
];
const rw = [1100, 3900, 1900, 2460];
const icell = (text, w, head) => new TableCell({ width: { size: w, type: WidthType.DXA }, margins: { top: 30, bottom: 30, left: 100, right: 100 },
  borders: { top: { style: BorderStyle.SINGLE, size: 6, color: INK }, bottom: { style: BorderStyle.SINGLE, size: 6, color: INK },
             left: { style: BorderStyle.SINGLE, size: 6, color: INK }, right: { style: BorderStyle.SINGLE, size: 6, color: INK } },
  children: [p(ink(text, { bold: head, size: 21 }), { after: 0, align: AlignmentType.CENTER })] });
const page9 = [
  pageBand('LAB BOOK — PAGE 9', 'Results table · mean · uncertainty · conclusion'),
  gap(),
  p(t('Copy this table by hand (or glue in print pack page 4):', { size: 20, color: '595959', italics: true })),
  new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: rw, rows: [
    new TableRow({ children: [icell('Run #', rw[0], true), icell('Trendline Equation', rw[1], true), icell('R² value', rw[2], true), icell('Value of g (m/s²)', rw[3], true)] }),
    ...runs.map((r) => new TableRow({ children: r.map((v, i) => icell(v, rw[i])) })),
  ] }),
  gap(160),
  p(ink('Mean Value of g', { bold: true, underline: true })),
  p(ink('x̄ = Σxᵢ / n', { size: 22 })),
  p(ink('= (8.6225 + 8.7772 + 8.8864 + 8.6806 + 9.0588 + 9.1246 + 8.8489 + 8.9518 + 9.0938) / 9', { size: 19 })),
  p(ink('= 80.0446 / 9 = 8.8938', { size: 22 })),
  new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [4500, 4860], rows: [new TableRow({ children: [
    new TableCell({ width: { size: 4500, type: WidthType.DXA }, borders: noBorders, children: [boxed(ink('g ≈ 8.89 m/s²', { bold: true }))] }),
    new TableCell({ width: { size: 4860, type: WidthType.DXA }, borders: noBorders, children: [boxed(ink('Using TI-84 (1-Var Stats): Sx = 0.180 m/s²', { bold: true, size: 20 }))] }),
  ] })] }),
  gap(160),
  ownWords('Uncertainty: write in your own words, including:', [
    'Air resistance is the main error, and you have evidence: g from the first half of each fall averaged 9.22 m/s² but the second half only 8.42 m/s² (light ball with holes).',
    'The ball was let go by hand, somewhere within one frame (8 ms) of t = 0.',
    'The drop height was measured with a metre stick (±0.5 cm of 82.5 cm, about 0.6%).',
    'One video (IMG_3041) was a duplicate of IMG_3055, so 9 runs were used, not 10.',
  ]),
  gap(160),
  p(ink('Percent error = | Experimental − Theoretical | / Theoretical × 100', { size: 21 })),
  p(ink('= | 8.89 − 9.81 | / 9.81 × 100 = 9.34 %', { size: 22, bold: true })),
  gap(80),
  p(ink('CONCLUSION', { bold: true, underline: true, highlight: 'yellow' }), { after: 60 }),
  boxed(ink('g = 8.89 m/s²,  Sx = ±0.18 m/s²,  percent error = 9.34 %', { bold: true, size: 21 })),
  p(ink('or rounded: 8.9 ± 0.2 m/s², 9 %', { size: 20 }), { before: 60 }),
];

// ---------------------------------------------------------------- page 10 (optional)
const page10 = [
  pageBand('LAB BOOK — PAGE 10 (optional)', 'Extension: all runs combined · air resistance · improvements'),
  gap(),
  glue(5, 'All 9 runs combined graph', 470),
  p(ink('One trendline through all 424 points: g = 8.882 ± 0.032 m/s². Combining runs shrinks the random error, but not the error from air resistance.', { size: 21 }), { before: 100 }),
  gap(120),
  new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [4300, 5060], rows: [new TableRow({ children: [
    new TableCell({ width: { size: 4300, type: WidthType.DXA }, borders: noBorders, children: [glue(6, 'Air resistance check', 240, 4100)] }),
    new TableCell({ width: { size: 5060, type: WidthType.DXA }, borders: noBorders, margins: { left: 200 }, children: [
      ownWords('Improvements: in your own words, e.g.', [
        'A heavier, solid ball (golf or steel) so air resistance matters less.',
        'A cleaner release (cutting the string, or an electromagnet) so t = 0 is exact.',
        'A higher frame rate (240 fps) for more points and better timing.',
        'A metre stick turned to face the camera, as a second check on the scale.',
      ], 4860),
    ] }),
  ] })] }),
];

const doc = new Document({
  creator: 'George', title: 'Lab Book Layout — Experiment 2',
  styles: { default: { document: { run: { font: FONT, size: 22 } } } },
  numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1440, right: 1440 } } },
    children: [...cover, brk(), ...page5, brk(), ...page6, brk(), ...page7, brk(), ...page8, brk(), ...page9, brk(), ...page10],
  }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(out, buf); console.log('saved', out); });
