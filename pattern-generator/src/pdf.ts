import { degrees, PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Line, Pattern, Point } from './types.ts';

export const MM_TO_PT = 72 / 25.4;
export const paperSizeMm = (paper: 'A4' | 'Letter'): [number, number] =>
  paper === 'A4' ? [210, 297] : [215.9, 279.4];

export type TilePlan = {
  paperWidthMm: number; paperHeightMm: number; contentWidthMm: number;
  contentHeightMm: number; stepX: number; stepY: number; cols: number; rows: number;
};

export function planTiles(pattern: Pattern): TilePlan {
  const [paperWidthMm, paperHeightMm] = paperSizeMm(pattern.input.print.paper);
  const { marginMm, overlapMm } = pattern.input.print;
  const contentWidthMm = paperWidthMm - 2 * marginMm;
  const contentHeightMm = paperHeightMm - 2 * marginMm;
  const stepX = contentWidthMm - overlapMm;
  const stepY = contentHeightMm - overlapMm;
  return {
    paperWidthMm, paperHeightMm, contentWidthMm, contentHeightMm, stepX, stepY,
    cols: Math.max(1, Math.ceil((pattern.widthMm - contentWidthMm) / stepX) + 1),
    rows: Math.max(1, Math.ceil((pattern.heightMm - contentHeightMm) / stepY) + 1),
  };
}

// Liang-Barsky segment clipping in pattern millimeters.
export function clipLine(line: Line, xmin: number, ymin: number, xmax: number, ymax: number): Line | null {
  const { from: a, to: b } = line;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy], q = [a.x - xmin, xmax - a.x, a.y - ymin, ymax - a.y];
  let u1 = 0, u2 = 1;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-10) { if (q[i] < 0) return null; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) u1 = Math.max(u1, t);
      else u2 = Math.min(u2, t);
    }
    if (u1 > u2) return null;
  }
  return { ...line,
    from: { x: a.x + u1 * dx, y: a.y + u1 * dy },
    to: { x: a.x + u2 * dx, y: a.y + u2 * dy } };
}

const printable = (value: string) => value.replace(/[^\x20-\x7E]/g, '?');

export async function renderTiledPdf(pattern: Pattern): Promise<Uint8Array> {
  const plan = planTiles(pattern);
  const { marginMm } = pattern.input.print;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidthPt = plan.paperWidthMm * MM_TO_PT;
  const pageHeightPt = plan.paperHeightMm * MM_TO_PT;
  const black = rgb(0.1, 0.1, 0.1), gray = rgb(0.45, 0.45, 0.45), red = rgb(0.68, 0.15, 0.13), blue = rgb(0.16, 0.38, 0.48);
  const cover = pdf.addPage([pageWidthPt, pageHeightPt]);
  const tx = (x: number) => x * MM_TO_PT;
  const ty = (y: number) => pageHeightPt - y * MM_TO_PT;
  cover.drawText(printable(pattern.input.garment.name), { x: tx(20), y: ty(24), size: 18, font: bold, color: black });
  const details = [
    'Gathered skirt - true-scale tiled pattern',
    `Paper: ${pattern.input.print.paper} | Tile grid: ${plan.cols} columns x ${plan.rows} rows`,
    `Finished length: ${pattern.input.garment.finishedLengthMm} mm`,
    `Shell circumference: ${pattern.dimensions.shellCircumferenceMm.toFixed(1)} mm`,
    `Effective fullness: ${pattern.dimensions.effectiveFullnessRatio.toFixed(2)} x waist`,
    `Elastic cut length: ${pattern.dimensions.elasticCutLengthMm.toFixed(1)} mm, including overlap`,
    'Print at 100% / actual size. Disable fit-to-page and scaling.',
    `Trim/align tile frames; adjacent tiles overlap ${pattern.input.print.overlapMm} mm.`,
    'Measure the square below with a ruler before cutting fabric.',
  ];
  details.forEach((detail, i) => cover.drawText(detail, { x: tx(20), y: ty(40 + i * 8), size: 9, font, color: black }));
  cover.drawRectangle({ x: tx(20), y: ty(180), width: tx(50), height: tx(50), borderWidth: 1, borderColor: black });
  cover.drawText('50 x 50 mm calibration square', { x: tx(20), y: ty(186), size: 9, font, color: black });
  cover.drawText('A1 is upper left; assemble rows left to right, then downward.', { x: tx(20), y: ty(205), size: 9, font, color: black });
  cover.drawText('Cut solid lines; gray dashed lines are stitching; red dashed lines are folds.', { x: tx(20), y: ty(215), size: 9, font, color: black });
  const paintLine = (page: ReturnType<typeof pdf.addPage>, item: Line, origin: Point) => {
    const clipped = clipLine(item, origin.x, origin.y, origin.x + plan.contentWidthMm, origin.y + plan.contentHeightMm);
    if (!clipped) return;
    const map = (p: Point) => ({
      x: (marginMm + p.x - origin.x) * MM_TO_PT,
      y: pageHeightPt - (marginMm + p.y - origin.y) * MM_TO_PT,
    });
    const color = item.kind === 'fold' ? red : item.kind === 'grain' ? blue : item.kind === 'stitch' ? gray : black;
    page.drawLine({ start: map(clipped.from), end: map(clipped.to), thickness: item.kind === 'cut' ? 1.1 : 0.75,
      color, dashArray: item.kind === 'fold' ? [12, 5] : item.kind === 'stitch' ? [6, 4] : undefined });
    if (item.kind === 'grain' && clipped.to.x === item.to.x && clipped.to.y === item.to.y) {
      const tip = map(item.to);
      for (const dx of [-2.5, 2.5]) page.drawLine({ start: tip,
        end: map({ x: item.to.x + dx, y: item.to.y - 5 }), thickness: 0.75, color: blue });
    }
  };
  for (let row = 0; row < plan.rows; row++) for (let col = 0; col < plan.cols; col++) {
    const page = pdf.addPage([pageWidthPt, pageHeightPt]);
    const origin = { x: col * plan.stepX, y: row * plan.stepY };
    const tileName = `${String.fromCharCode(65 + row)}${col + 1}`;
    page.drawText(`${tileName}  |  ${pattern.input.garment.name}  |  100%`, {
      x: tx(marginMm), y: ty(5.2), size: 8, font: bold, color: black,
    });
    page.drawRectangle({ x: tx(marginMm), y: ty(plan.paperHeightMm - marginMm),
      width: tx(plan.contentWidthMm), height: tx(plan.contentHeightMm), borderWidth: 0.45, borderColor: gray });
    for (const piece of pattern.pieces) {
      for (const item of piece.lines) paintLine(page, item, origin);
      const foldAt = { x: piece.origin.x - 3, y: piece.origin.y + piece.heightMm / 2 };
      if (foldAt.x >= origin.x && foldAt.x <= origin.x + plan.contentWidthMm - 35 &&
          foldAt.y >= origin.y + 5 && foldAt.y <= origin.y + plan.contentHeightMm - 5)
        page.drawText('PLACE ON FOLD', { x: tx(marginMm + foldAt.x - origin.x),
          y: ty(marginMm + foldAt.y - origin.y), size: 8, font: bold, color: red,
          rotate: degrees(90) });
      for (const label of piece.labels) {
        if (label.at.x < origin.x || label.at.x > origin.x + plan.contentWidthMm - 35 ||
            label.at.y < origin.y + 5 || label.at.y > origin.y + plan.contentHeightMm - 5) continue;
        page.drawText(printable(label.text), { x: tx(marginMm + label.at.x - origin.x),
          y: ty(marginMm + label.at.y - origin.y), size: (label.sizeMm ?? 3.5) * MM_TO_PT,
          font: label.text === piece.title ? bold : font, color: black });
      }
    }
    page.drawText(`Page ${row * plan.cols + col + 1}/${plan.rows * plan.cols}`, {
      x: tx(marginMm), y: ty(plan.paperHeightMm - 4), size: 7, font, color: gray });
  }
  return pdf.save();
}
