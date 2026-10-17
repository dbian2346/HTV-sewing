import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { generatePattern, exportSVG, exportPDF, offsetRectangle, distance, planTiles,
  MM_TO_PT, PAPER_SIZES, specSchema, piecePrimitives } from '../src/index.js';
import { readFileSync } from 'node:fs';

const input = () => JSON.parse(readFileSync(new URL('../examples/gathered-skirt.json', import.meta.url), 'utf8'));
const plain = () => JSON.parse(readFileSync(new URL('../examples/plain-skirt.json', import.meta.url), 'utf8'));
function streams(doc: PDFDocument) {
  return doc.context.enumerateIndirectObjects().flatMap(([, object]) =>
    object instanceof PDFRawStream ? [Buffer.from(decodePDFRawStream(object).decode()).toString('utf8')] : []);
}

describe('draft dimensions and assembly', () => {
  it('drafts the reference skirt with exact allowances and finished length', () => {
    const p = generatePattern(input());
    expect(p.pieces).toHaveLength(5);
    expect(p.dimensions).toEqual({ finishedLength: 600, bodyHeight: 450, skirtCircumference: 1440,
      waistbandCircumference: 1020, elasticJoinedLength: 648, elasticCutLength: 668 });
    expect(p.pieces.map(p => [p.id, p.stitch.width, p.stitch.height, p.cut.width, p.cut.height])).toEqual([
      ['front', 720, 450, 740, 470], ['back', 720, 450, 740, 470], ['waistband', 1020, 60, 1040, 80],
      ['ruffle-front', 1080, 120, 1100, 155], ['ruffle-back', 1080, 120, 1100, 155],
    ]);
    expect(30 + p.pieces[0]!.stitch.height + p.pieces[3]!.stitch.height).toBe(600);
  });
  it('uses hem allowance on the plain skirt body instead of a ruffle seam', () => {
    const p = generatePattern(plain());
    expect(p.pieces).toHaveLength(3);
    expect(p.pieces[0]!.stitch.height).toBe(570);
    expect(p.pieces[0]!.cut.height).toBe(605);
    expect(p.pieces[0]!.allowances.bottom).toBe(25);
    expect(p.pieces[0]!.foldlines[0]!.from.y).toBe(592.5);
  });
  it('records seam lengths from actual geometry, with gathering only at intended joins', () => {
    const p = generatePattern(input());
    for (const seam of p.seams) {
      const sum = (refs: typeof seam.from) => refs.reduce((n, ref) => {
        const piece = p.pieces.find(p => p.id === ref.piece)!;
        return n + (['top', 'bottom'].includes(ref.edge) ? piece.stitch.width : piece.stitch.height);
      }, 0);
      expect(seam.sourceLength).toBe(sum(seam.from));
      expect(seam.targetLength).toBe(sum(seam.to));
      expect(seam.sourceLength / seam.targetLength).toBeCloseTo(seam.gatherRatio, 12);
      if (!seam.id.includes('attachment')) expect(seam.sourceLength).toBe(seam.targetLength);
    }
    expect(p.seams.find(s => s.id === 'ruffle-attachment-front')!.gatherRatio).toBe(1.5);
  });
  it('places center and quarter notches correctly before gathering', () => {
    const p = generatePattern(input());
    expect(p.pieces[0]!.notches[0]!.offset / p.pieces[0]!.stitch.width).toBe(0.5);
    expect(p.pieces[3]!.notches[0]!.offset / p.pieces[3]!.stitch.width).toBe(0.5);
    expect(p.pieces[2]!.notches.filter(n => n.edge === 'bottom').map(n => n.offset)).toEqual([255, 510, 765]);
    expect(p.pieces[2]!.foldlines[0]!.from.y).toBe(40);
  });
  it('adjusts dimensions for noninteger input and custom allowances without rounding geometry', () => {
    const s = input(); s.measurements.waist = 721.3; s.garment.fullnessRatio = 2.1;
    s.garment.ruffle.fullnessRatio = 1.7; s.construction = { seamAllowance: 12.5, hemAllowance: 31.5 };
    const p = generatePattern(s);
    expect(p.pieces[0]!.stitch.width).toBeCloseTo(721.3 * 2.1 / 2, 10);
    expect(p.pieces[0]!.cut.width - p.pieces[0]!.stitch.width).toBeCloseTo(25);
    expect(p.pieces[3]!.cut.height).toBe(164);
  });
  it('is deterministic and does not mutate the input', () => {
    const s = input(), before = JSON.stringify(s);
    expect(generatePattern(s)).toEqual(generatePattern(s));
    expect(JSON.stringify(s)).toBe(before);
    expect(exportSVG(generatePattern(s))).toBe(exportSVG(generatePattern(s)));
  });
  it('accepts zero allowances and suppresses cutting notches at those edges', () => {
    const s = plain(); s.construction = { seamAllowance: 0, hemAllowance: 0 };
    const p = generatePattern(s);
    expect(p.pieces[0]!.cut).toEqual(p.pieces[0]!.stitch);
    expect(piecePrimitives(p.pieces[0]!).every(p => p.kind !== 'text' || Number.isFinite(p.size))).toBe(true);
  });
});

describe('input validation', () => {
  it('applies defaults', () => expect(specSchema.parse(plain()).garment.waistband.elasticWidth).toBe(25));
  it.each([
    ['negative waist', (s: any) => { s.measurements.waist = -1; }],
    ['nonfinite hip', (s: any) => { s.measurements.hip = Infinity; }],
    ['string input', (s: any) => { s.measurements.waist = '720'; }],
    ['unknown unit', (s: any) => { s.units = 'inches'; }],
    ['unknown garment', (s: any) => { s.garment.type = 'shirt'; }],
    ['unknown nested key', (s: any) => { s.garment.waistband.elasticWdth = 20; }],
    ['skirt too narrow for hips', (s: any) => { s.garment.fullnessRatio = 1; }],
    ['no body remaining', (s: any) => { s.garment.length = 150; }],
    ['elastic too wide', (s: any) => { s.garment.waistband.elasticWidth = 29; }],
    ['insufficient elastic stretch', (s: any) => { s.garment.waistband.elasticStretchRatio = 1.1; }],
    ['negative allowance', (s: any) => { s.construction.hemAllowance = -2; }],
    ['ruffle below body width', (s: any) => { s.garment.ruffle.fullnessRatio = 0.8; }],
  ])('rejects %s', (_name, mutate) => { const s = input(); mutate(s); expect(() => generatePattern(s)).toThrow(); });
  it('ignores disabled ruffle height in finished length', () => {
    const s = input(); s.garment.ruffle.enabled = false; s.garment.ruffle.height = 900;
    expect(generatePattern(s).dimensions.bodyHeight).toBe(570);
  });
});

describe('geometry and SVG', () => {
  it('offsets asymmetric rectangle edges', () => {
    expect(offsetRectangle({ x: 3, y: 5, width: 100, height: 200 }, { top: 1, right: 2, bottom: 3, left: 4 }))
      .toEqual({ x: -1, y: 4, width: 106, height: 204 });
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
  it('rejects invalid offsets', () => expect(() => offsetRectangle({ x: 0, y: 0, width: 0, height: 1 },
    { top: 0, right: 0, bottom: 0, left: 0 })).toThrow());
  it('exports physical mm units, all pieces and both line styles', () => {
    const svg = exportSVG(generatePattern(input()));
    expect(svg).toMatch(/width="1130mm"/);
    expect(svg).toContain('viewBox="0 0 1130 ');
    expect(svg).toContain('id="ruffle-back"');
    expect(svg).toContain('class="cut" d="M 0 0 L 740 0"');
    expect(svg).toContain('class="stitch" d="M 10 10 L 730 10"');
    expect(svg).toContain('FOLD - TOP OF CASING');
  });
});

describe('tile coverage', () => {
  it('handles exact boundaries without adding blank pages', () => {
    expect(planTiles(186, 273, 186, 273, 10).tiles).toHaveLength(1);
    expect(planTiles(362, 536, 186, 273, 10).tiles).toHaveLength(4);
    expect(planTiles(362.1, 536, 186, 273, 10).columns).toBe(3);
  });
  it.each([0, 10, 25])('covers every point and repeats precisely %s mm', overlap => {
    const p = planTiles(1112, 482, 186, 273, overlap);
    expect(p.tiles.at(-1)!.x + p.viewportWidth).toBeGreaterThanOrEqual(1112);
    expect(p.tiles.at(-1)!.y + p.viewportHeight).toBeGreaterThanOrEqual(482);
    expect(p.viewportWidth - p.stepX).toBe(overlap);
    expect(p.viewportHeight - p.stepY).toBe(overlap);
  });
  it.each([-1, 186, Infinity])('rejects invalid overlap %s', overlap => expect(() => planTiles(200, 300, 186, 273, overlap)).toThrow());
});

describe('PDF output', () => {
  it.each(['A4', 'Letter'] as const)('uses correct %s MediaBoxes, page counts, scaling preference and a 50 mm square', async paperSize => {
    const p = generatePattern(input()), paper = PAPER_SIZES[paperSize];
    const bytes = await exportPDF(p, { paperSize });
    const doc = await PDFDocument.load(bytes);
    const count = p.pieces.reduce((n, p) => n + planTiles(p.cut.width + 12, p.cut.height + 12,
      paper.width - 24, paper.height - 24, 10).tiles.length, 1);
    expect(doc.getPageCount()).toBe(count);
    for (const page of doc.getPages()) {
      expect(page.getWidth()).toBeCloseTo(paper.width * MM_TO_PT, 9);
      expect(page.getHeight()).toBeCloseTo(paper.height * MM_TO_PT, 9);
    }
    expect(doc.catalog.getOrCreateViewerPreferences().getPrintScaling()).toBe('None');
    const content = streams(doc);
    // Calibration is a vector rectangle, exactly 50 mm between stroke centers.
    expect(content[0]).toContain(`${50 * MM_TO_PT} 0 l`);
    // First body tile has unscaled 740 mm cutting width; the graphics clip preserves partial paths.
    expect(content[1]).toContain(`${(12 + 6 + 740) * MM_TO_PT}`);
    expect(content[1]).toContain('W\nn');
    expect(doc.getPage(0).node.get(PDFName.of('Resources'))).toBeDefined();
  });
  it('can omit the calibration page and export full-size sheets without scaling', async () => {
    const p = generatePattern(plain());
    const doc = await PDFDocument.load(await exportPDF(p, { tiled: false, calibrationSquare: false }));
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(0).getWidth()).toBeCloseTo((740 + 12 + 24) * MM_TO_PT, 9);
    expect(doc.getPage(0).getHeight()).toBeCloseTo((605 + 12 + 24) * MM_TO_PT, 9);
  });
  it('produces identical PDF bytes for identical inputs', async () => {
    const p = generatePattern(plain());
    expect(await exportPDF(p)).toEqual(await exportPDF(p));
  });
  it('rejects excessive output before rendering', async () => {
    await expect(exportPDF(generatePattern(input()), { maxPages: 1 })).rejects.toThrow('maxPages');
    await expect(exportPDF(generatePattern(input()), { margin: 100 })).rejects.toThrow();
    await expect(exportPDF(generatePattern(input()), { overlap: 500 })).rejects.toThrow();
  });
});
