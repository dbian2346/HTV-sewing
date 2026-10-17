import { PDFDocument, StandardFonts, rgb, PrintScaling, pushGraphicsState, popGraphicsState,
  rectangle, clip, endPath, degrees, type PDFPage, type PDFFont } from 'pdf-lib';
import { z } from 'zod';
import type { Pattern } from './draft.js';
import { type Primitive } from './geometry.js';
import { gatheredVectorPattern, type VectorPattern } from './vector.js';

export const MM_TO_PT = 72 / 25.4;
export const PAPER_SIZES = { A4: { width: 210, height: 297 }, Letter: { width: 215.9, height: 279.4 } } as const;
const optionsSchema = z.strictObject({
  paperSize: z.enum(['A4', 'Letter']).default('A4'),
  tiled: z.boolean().default(true),
  calibrationSquare: z.boolean().default(true),
  margin: z.number().finite().min(10).max(40).default(12),
  overlap: z.number().finite().min(0).max(50).default(10),
  maxPages: z.number().int().min(1).max(1000).default(500),
});
export type PDFOptions = z.input<typeof optionsSchema>;
export interface Tile { row: number; column: number; x: number; y: number }
export interface TilePlan { columns: number; rows: number; viewportWidth: number; viewportHeight: number;
  stepX: number; stepY: number; tiles: Tile[] }
export function planTiles(width: number, height: number, viewportWidth: number, viewportHeight: number, overlap: number): TilePlan {
  if (![width, height, viewportWidth, viewportHeight, overlap].every(Number.isFinite) ||
    Math.min(width, height, viewportWidth, viewportHeight) <= 0 || overlap < 0 || overlap >= Math.min(viewportWidth, viewportHeight))
    throw new RangeError('Positive finite dimensions and overlap smaller than the viewport are required.');
  const stepX = viewportWidth - overlap, stepY = viewportHeight - overlap;
  const columns = Math.max(1, Math.ceil((width - overlap - 1e-9) / stepX));
  const rows = Math.max(1, Math.ceil((height - overlap - 1e-9) / stepY));
  if (columns * rows > 1000) throw new RangeError('Tile plan exceeds 1000 pages.');
  const tiles: Tile[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++)
    tiles.push({ row, column, x: column * stepX, y: row * stepY });
  return { columns, rows, viewportWidth, viewportHeight, stepX, stepY, tiles };
}
const black = rgb(0, 0, 0), gray = rgb(0.45, 0.45, 0.45);
function drawPrimitive(page: PDFPage, p: Primitive, font: PDFFont, map: (x: number, y: number) => { x: number; y: number }) {
  if (p.kind === 'text') {
    page.drawText(p.text, { ...map(p.at.x, p.at.y), size: p.size * MM_TO_PT, font, color: black,
      rotate: degrees(-(p.rotation ?? 0)) });
  } else if (p.kind === 'path') {
    page.drawSvgPath(p.d, { ...map(0, 0), scale: MM_TO_PT, borderColor: black,
      borderWidth: p.style === 'cut' ? 0.3 : 0.2,
      borderDashArray: p.style === 'stitch' ? [3, 2] : p.style === 'fold' ? [5, 1, 1, 1] : undefined });
  } else page.drawLine({ start: map(p.from.x, p.from.y), end: map(p.to.x, p.to.y), color: black,
    thickness: (p.style === 'cut' ? 0.3 : 0.2) * MM_TO_PT,
    dashArray: p.style === 'stitch' ? [3 * MM_TO_PT, 2 * MM_TO_PT] :
      p.style === 'fold' ? [5 * MM_TO_PT, MM_TO_PT, MM_TO_PT, MM_TO_PT] : undefined });
}

export async function exportPDF(pattern: Pattern, input: PDFOptions = {}): Promise<Uint8Array> {
  return exportVectorPDF(gatheredVectorPattern(pattern), input);
}

export async function exportVectorPDF(pattern: VectorPattern, input: PDFOptions = {}): Promise<Uint8Array> {
  const o = optionsSchema.parse(input), paper = PAPER_SIZES[o.paperSize];
  // Every piece gets an independent tile grid, avoiding large empty canvas regions.
  const padding = 6;
  const plans = pattern.pieces.map(piece => ({ piece, plan: o.tiled
    ? planTiles(piece.width + padding * 2, piece.height + padding * 2,
      paper.width - 2 * o.margin, paper.height - 2 * o.margin, o.overlap)
    : planTiles(piece.width + padding * 2, piece.height + padding * 2,
      piece.width + padding * 2, piece.height + padding * 2, 0) }));
  const totalPages = plans.reduce((n, p) => n + p.plan.tiles.length, 0) + (o.calibrationSquare ? 1 : 0);
  if (totalPages > o.maxPages) throw new RangeError(`Export needs ${totalPages} pages; maxPages is ${o.maxPages}.`);
  const doc = await PDFDocument.create();
  doc.setTitle(pattern.title);
  doc.setCreator('Parametric sewing pattern engine');
  const epoch = new Date('2000-01-01T00:00:00.000Z');
  doc.setCreationDate(epoch); doc.setModificationDate(epoch);
  doc.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const nativePages = new Map<string, import('pdf-lib').PDFEmbeddedPage>();
  for (const { piece } of plans) if (piece.svg) {
    const { svgPDF } = await import('./svg-pdf.js');
    const [embedded] = await doc.embedPdf(await svgPDF(piece.svg, piece.width * MM_TO_PT, piece.height * MM_TO_PT));
    nativePages.set(piece.id, embedded!);
  }
  if (o.calibrationSquare) {
    const page = doc.addPage([paper.width * MM_TO_PT, paper.height * MM_TO_PT]);
    const write = (text: string, y: number, size = 10) => page.drawText(text,
      { x: 18 * MM_TO_PT, y: (paper.height - y) * MM_TO_PT, font, size });
    write('PRINT AT 100% / ACTUAL SIZE', 22, 14);
    write('Disable Fit, Shrink, and printer scaling. Measure before cutting fabric.', 30, 9);
    page.drawRectangle({ x: 18 * MM_TO_PT, y: (paper.height - 92) * MM_TO_PT,
      width: 50 * MM_TO_PT, height: 50 * MM_TO_PT, borderWidth: 0.25 * MM_TO_PT, borderColor: black });
    write('50 x 50 mm - measure between the line centers', 100, 9);
    write(`Paper: ${o.paperSize}. ${totalPages} pages including this guide. All pattern lengths in mm.`, 111, 9);
    write(o.tiled ? `Trim white margins; align repeated crosses and lines in the ${o.overlap} mm overlap.` :
      'Pattern pages use custom full-size sheets; this guide uses the selected paper.', 120, 8);
    write('Assemble each piece separately in row/column order. Do not scale any page.', 127, 9);
    write(pattern.legend ?? 'Solid: cut. Dashed: stitch / finished hem. Dot-dash: fold.', 134, 8);
    write(pattern.cuttingInstructions, 141, 8);
    write('Piece tile grids:', 154, 10);
    plans.slice(0, 5).forEach(({ piece, plan }, i) => write(`${piece.name}: ${plan.rows} rows x ${plan.columns} columns`, 162 + i * 6, 8));
    if (plans.length > 5) write(`${plans.length - 5} additional piece grids are labeled on their individual sheets.`, 195, 8);
    write(pattern.constructionNote, 204, 8);
    write('Page 1 - Calibration and assembly guide', paper.height - 6, 8);
  }
  for (const { piece, plan } of plans) for (const tile of plan.tiles) {
    const width = o.tiled ? paper.width : plan.viewportWidth + o.margin * 2;
    const height = o.tiled ? paper.height : plan.viewportHeight + o.margin * 2;
    if (Math.max(width, height) * MM_TO_PT > 14400) throw new RangeError('Untiled sheet exceeds the standard PDF page size limit. Use tiled output.');
    const page = doc.addPage([width * MM_TO_PT, height * MM_TO_PT]);
    const map = (x: number, y: number) => ({ x: (o.margin + padding + x - tile.x) * MM_TO_PT,
      y: (height - o.margin - padding - y + tile.y) * MM_TO_PT });
    page.pushOperators(pushGraphicsState(), rectangle(o.margin * MM_TO_PT, o.margin * MM_TO_PT,
      plan.viewportWidth * MM_TO_PT, plan.viewportHeight * MM_TO_PT), clip(), endPath());
    const nativePage = nativePages.get(piece.id);
    if (nativePage) page.drawPage(nativePage, { x: map(0, 0).x, y: map(0, piece.height).y,
      width: piece.width * MM_TO_PT, height: piece.height * MM_TO_PT });
    else for (const primitive of piece.primitives) drawPrimitive(page, primitive, font, map);
    // Registration crosses use shared piece-space coordinates, so adjoining tiles repeat the exact mark.
    if (o.tiled && o.overlap > 0) {
      const xs = new Set<number>(), ys = new Set<number>();
      for (const col of [tile.column, tile.column + 1]) if (col > 0 && col < plan.columns) xs.add(col * plan.stepX + o.overlap / 2);
      for (const row of [tile.row, tile.row + 1]) if (row > 0 && row < plan.rows) ys.add(row * plan.stepY + o.overlap / 2);
      // Repeated edge midpoints work even for a grid with only one row or one column.
      for (const x of xs) for (const dy of [plan.viewportHeight / 3, 2 * plan.viewportHeight / 3]) {
        const y = tile.y + dy;
        for (const [dx1, dy1, dx2, dy2] of [[-2, 0, 2, 0], [0, -2, 0, 2]])
          page.drawLine({ start: map(x - padding + dx1!, y - padding + dy1!), end: map(x - padding + dx2!, y - padding + dy2!), color: gray, thickness: 0.4 });
      }
      for (const y of ys) for (const dx of [plan.viewportWidth / 3, 2 * plan.viewportWidth / 3]) {
        const x = tile.x + dx;
        for (const [dx1, dy1, dx2, dy2] of [[-2, 0, 2, 0], [0, -2, 0, 2]])
          page.drawLine({ start: map(x - padding + dx1!, y - padding + dy1!), end: map(x - padding + dx2!, y - padding + dy2!), color: gray, thickness: 0.4 });
      }
    }
    page.pushOperators(popGraphicsState());
    page.drawRectangle({ x: o.margin * MM_TO_PT, y: o.margin * MM_TO_PT,
      width: plan.viewportWidth * MM_TO_PT, height: plan.viewportHeight * MM_TO_PT, borderColor: gray, borderWidth: 0.3 });
    page.drawText(`${piece.name} | row ${tile.row + 1}/${plan.rows}, col ${tile.column + 1}/${plan.columns}`,
      { x: o.margin * MM_TO_PT, y: (height - 6) * MM_TO_PT, size: 8, font });
    page.drawText(`Page ${doc.getPageCount()}/${totalPages} | 100% actual size | ${o.tiled ? `${o.overlap} mm overlap` : 'Full-size sheet'} | ${pattern.legend ? 'Native FreeSewing markings' : 'Solid=cut, dashed=stitch'}`,
      { x: o.margin * MM_TO_PT, y: 5 * MM_TO_PT, size: 7, font });
  }
  return doc.save({ useObjectStreams: false });
}
