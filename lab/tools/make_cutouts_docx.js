// Print-and-cut sheets: every item to glue into the lab book, each in a dashed cut box labelled with
// the lab book page it goes on, packed onto as few Letter sheets as possible.
//   node lab/tools/make_cutouts_docx.js lab/print/items_hi lab/print/Print_and_Cut_George.docx
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, PageBreak,
} = require('docx');

const [imgDir, out] = process.argv.slice(2);
const FONT = 'Arial';

function image(name, widthIn) {
  const buf = fs.readFileSync(path.join(imgDir, `item-${name}.png`));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const px = Math.round(widthIn * 96);
  return new ImageRun({ type: 'png', data: buf, transformation: { width: px, height: Math.round(px * h / w) } });
}
const run = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || 18, bold: o.bold, color: o.color, italics: o.italics });
const para = (children, o = {}) => new Paragraph({ children, alignment: o.align, spacing: { before: o.before || 0, after: o.after ?? 0 } });

// One dashed cut box: a label strip, then the item.
function cutBox(name, widthIn, page, title, note) {
  const dashed = { style: BorderStyle.DASHED, size: 12, color: '7F7F7F' };
  const wDxa = Math.round(widthIn * 1440) + 240;
  return new Table({
    alignment: AlignmentType.CENTER,
    width: { size: wDxa, type: WidthType.DXA }, columnWidths: [wDxa],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: wDxa, type: WidthType.DXA },
      borders: { top: dashed, bottom: dashed, left: dashed, right: dashed },
      margins: { top: 80, bottom: 100, left: 120, right: 120 },
      children: [
        para([run('✂  ', { size: 20, color: '7F7F7F' }), run(`LAB BOOK PAGE ${page}`, { bold: true, color: 'C55A11' }),
              run(`  ·  ${title}`, { bold: true }), ...(note ? [run(`  ·  ${note}`, { italics: true, color: '7F7F7F', size: 16 })] : [])],
             { after: 60 }),
        para([image(name, widthIn)], { align: AlignmentType.CENTER }),
      ],
    })] })],
  });
}
const gap = (pt = 10) => new Paragraph({ children: [], spacing: { after: pt * 20 } });
const brk = () => new Paragraph({ children: [new PageBreak()] });
const sheetHead = (n, total, extra) => para([run(`PRINT & CUT — Experiment 2 (George)  ·  sheet ${n} of ${total}`, { bold: true, size: 18, color: '1F4E79' }),
  ...(extra ? [run(`  ·  ${extra}`, { size: 16, color: '595959' })] : [])], { after: 120 });

const children = [
  sheetHead(1, 4, 'Print at 100% (actual size, not "fit to page"). Cut along the dashed lines.'),
  cutBox('1', 7.0, 6, 'Example of tracking (Run 3)'),
  gap(14),
  cutBox('3', 6.2, 8, 'Velocity–time graph, Run 3'),
  brk(),
  sheetHead(2, 4),
  cutBox('2', 5.0, 7, 'Recorded data for Run 3', 'glue on the left half of the page'),
  gap(14),
  cutBox('6', 3.6, 10, 'Air resistance check', 'optional extra'),
  brk(),
  sheetHead(3, 4),
  cutBox('4', 7.0, 9, 'Value of g for each run', 'or copy it by hand'),
  gap(14),
  cutBox('5', 6.2, 10, 'All 9 runs combined', 'optional extra'),
  brk(),
  sheetHead(4, 4, 'OPTIONAL: only print this if your teacher allows a printed diagram; otherwise draw it by hand.'),
  cutBox('apparatus', 7.0, 5, 'Apparatus diagram', 'optional'),
  gap(24),
  para([run('Checklist', { bold: true, size: 22 })], { after: 80 }),
  ...[
    ['Lab book page 5', 'Apparatus diagram (sheet 4, optional; or draw by hand)'],
    ['Lab book page 6', 'Example of tracking (sheet 1)'],
    ['Lab book page 7', 'Recorded data for Run 3 (sheet 2)'],
    ['Lab book page 8', 'Velocity–time graph, Run 3 (sheet 1)'],
    ['Lab book page 9', 'Value of g for each run (sheet 3, or copy by hand)'],
    ['Lab book page 10', 'All runs combined + air resistance check (sheets 2–3, optional extras)'],
  ].map(([a, b]) => para([run('☐  ', { size: 20 }), run(`${a}:  `, { bold: true, size: 20 }), run(b, { size: 20 })], { after: 60 })),
];

const doc = new Document({
  creator: 'George', title: 'Print and cut — Experiment 2',
  styles: { default: { document: { run: { font: FONT, size: 20 } } } },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
    children,
  }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(out, buf); console.log('saved', out); });
