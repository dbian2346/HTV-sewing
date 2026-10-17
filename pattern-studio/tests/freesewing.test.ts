import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Penelope } from '@pattern-studio/penelope-engine';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { generatePenelope, penelopeSchema, mapPenelopeSettings, exportVectorPDF, exportVectorSVG,
  generateStudioPattern, planTiles, PAPER_SIZES, MM_TO_PT } from '../src/index.js';
import { pathData } from '../src/freesewing/penelope.js';
import { trimStraightOffsetLoops } from '../src/freesewing/offset-joins.js';
const base = () => JSON.parse(readFileSync(new URL('../examples/penelope.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../design-catalog.json', import.meta.url), 'utf8')).designs.find((d: any) => d.designId === 'penelope');

describe('registered Penelope adapter', () => {
  it('trims self-crossing straight allowance joins without changing curved geometry', () => {
    const curve = { type: 'curve' as const, cp1: { x: -3, y: 25 }, cp2: { x: 5, y: 25 }, to: { x: 5, y: 30 } };
    const input = [{ type: 'move' as const, to: { x: 0, y: 0 } }, { type: 'line' as const, to: { x: 0, y: 10 } },
      { type: 'line' as const, to: { x: 3, y: 5 } }, { type: 'line' as const, to: { x: -3, y: 11 } },
      { type: 'line' as const, to: { x: -3, y: 20 } }, curve];
    const out = trimStraightOffsetLoops(input);
    expect(out).toEqual([input[0], { type: 'line', to: { x: 0, y: 8 } }, input[3], input[4], curve]);
    expect(input[1]!.to).toEqual({ x: 0, y: 10 });
  });
  it('matches the catalog bindings and the installed design configuration', () => {
    const spec = penelopeSchema.parse(base()), mapped = mapPenelopeSettings(spec);
    expect((Penelope.designConfig.data as { version: string }).version).toBe(catalog.runtimePackageVersion);
    expect(catalog.runtimeStatus).toBe('enabled-experimental');
    const installed = Object.assign({}, ...Penelope.designConfig.parts.map(p => p.options ?? {}));
    const required = [...new Set(Penelope.designConfig.parts.flatMap(p => p.measurements ?? []))].sort();
    expect(required).toEqual([...catalog.requiredMeasurements].sort());
    expect(Object.keys(spec.options).sort()).toEqual(Object.keys(catalog.options).sort());
    for (const [key, binding] of Object.entries(catalog.options) as [string, any][]) {
      expect(installed[binding.fsKey]).toBeDefined();
      const descriptor = installed[binding.fsKey];
      if (binding.min !== undefined) { expect(descriptor.min).toBe(binding.min); expect(descriptor.max).toBe(binding.max); }
      expect((mapped.options as Record<string, unknown>)[binding.fsKey]).toBe(binding.type === 'percent'
        ? (spec.options as Record<string, number>)[key]! / 100 : (spec.options as Record<string, unknown>)[key]);
    }
    expect(mapped.sa).toBe(10); expect(mapped.complete).toBe(true);
    expect(mapped.options.waistbandOverlap).toBe(0); expect(mapped.options.zipperLocation).toBe('backSeam');
  });
  it('drafts shaped front/back pieces and a correctly matched, optional waistband', () => {
    const p = generatePenelope(base());
    expect(p.engineVersion).toBe('3.1.0');
    expect(p.vector.pieces.map(p => [p.id, p.cutQuantity, p.onFold, p.mirrored])).toEqual([
      ['penelope.front', 1, true, false], ['penelope.back', 2, false, true], ['penelope.waistband', 1, true, false],
    ]);
    expect(p.dimensions.bodyLength).toBe(590);
    expect(p.dimensions.finishedLength).toBe(619.5);
    expect(p.dimensions.frontSideSeam).toBeCloseTo(606.36305, 4);
    expect(p.dimensions.backSideSeam).toBeCloseTo(606.41299, 4);
    expect(p.dimensions.closedWaist).toBeCloseTo(771.42964, 4);
    for (const piece of p.vector.pieces.slice(0, 2)) {
      const curves = piece.primitives.filter(p => p.kind === 'path' && p.d.includes('C '));
      expect(curves.length).toBeGreaterThanOrEqual(2);
      expect(piece.primitives.some(p => p.kind === 'path' && p.style === 'cut')).toBe(true);
      expect(piece.primitives.some(p => p.kind === 'text' && p.text === 'GRAIN')).toBe(true);
    }
    expect(p.vector.pieces[2]!.primitives.some(p => p.kind === 'text' && p.text === 'FOLD LENGTHWISE')).toBe(true);
  });
  it('omits the waistband and its height when disabled', () => {
    const spec = base(); spec.options.waistband = false;
    const p = generatePenelope(spec);
    expect(p.vector.pieces).toHaveLength(2);
    expect(p.dimensions.finishedLength).toBe(590);
    expect(p.checks).toHaveLength(2);
  });
  it('preserves cubic controls and sub-millimetre coordinates without flattening', () => {
    expect(pathData([{ type: 'move', to: { x: 1.123456789, y: 2 } }, { type: 'curve',
      cp1: { x: 3, y: 4 }, cp2: { x: 5, y: 6 }, to: { x: 7, y: 8 } }, { type: 'close' }], 10, 20))
      .toBe('M 11.123456789 22 C 13 24 15 26 17 28 Z');
    expect(() => pathData([{ type: 'move', to: { x: NaN, y: 0 } }])).toThrow('nonfinite');
  });
  it('keeps dart legs as stitching marks when seam allowance is zero', () => {
    const spec = base(); spec.construction.seamAllowanceMm = 0;
    const front = generatePenelope(spec).vector.pieces[0]!;
    const cut = front.primitives.find(p => p.kind === 'path' && p.style === 'cut');
    const seam = front.primitives.find(p => p.kind === 'path' && p.style === 'stitch');
    expect(cut?.kind).toBe('path'); expect(seam?.kind).toBe('path');
    if (cut?.kind === 'path' && seam?.kind === 'path') {
      expect(cut.d).not.toBe(seam.d);
      expect((cut.d.match(/C /g) ?? []).length).toBeLessThan((seam.d.match(/C /g) ?? []).length);
    }
  });
  it('rejects unregistered designs and unknown style requests', () => {
    const spec = base(); spec.garment.designId = 'not-a-design';
    expect(() => generateStudioPattern(spec)).toThrow('Unknown design');
    const unknown = base(); unknown.options.puffSleeves = true;
    expect(() => generatePenelope(unknown)).toThrow();
  });
  it.each([
    ['missing measurement', (s: any) => { delete s.measurements.waistToSeat; }],
    ['invalid vertical order', (s: any) => { s.measurements.waistToSeat = 150; }],
    ['unpaired back arcs', (s: any) => { delete s.measurements.seatBack; }],
    ['back arc exceeds circumference', (s: any) => { s.measurements.waistBack = 800; }],
    ['unsupported proportion', (s: any) => { s.measurements.waist = 1500; }],
    ['body shorter than seat', (s: any) => { s.options.lengthBonusPct = -50; s.measurements.waistToKnee = 400; }],
    ['dart count outside design', (s: any) => { s.options.nrOfDarts = 3; }],
    ['unsupported partial rendering', (s: any) => { s.render.complete = false; }],
  ])('rejects %s', (_label, mutate) => { const spec = base(); mutate(spec); expect(() => generatePenelope(spec)).toThrow(); });
  it('changes cutting bounds with seam allowances without changing matching stitch lengths', () => {
    const a = base(), b = base(); a.construction.seamAllowanceMm = 5; b.construction.seamAllowanceMm = 15;
    const p = generatePenelope(a), q = generatePenelope(b);
    expect(q.dimensions).toEqual(p.dimensions);
    expect(q.vector.pieces[0]!.width).toBeGreaterThan(p.vector.pieces[0]!.width);
    expect(q.vector.pieces[1]!.height).toBeGreaterThan(p.vector.pieces[1]!.height);
  });
  it('reproduces the same vector draft without date-dependent labels or mutating inputs', () => {
    const spec = base(), copy = structuredClone(spec);
    expect(generatePenelope(spec)).toEqual(generatePenelope(spec));
    expect(spec).toEqual(copy);
    expect(exportVectorSVG(generatePenelope(spec).vector)).not.toContain('plugin-annotations:');
  });
});

const variations = [0.75, 1, 1.25].flatMap(size => [true, false].flatMap(curvedDarts => [1, 2].flatMap(nrOfDarts =>
  [true, false].flatMap(backVent => [true, false].map(waistband => ({ size, curvedDarts, nrOfDarts, backVent, waistband }))))));
describe('size and supported style matrix', () => {
  it.each(variations)('matches seams for $size size, curved=$curvedDarts, darts=$nrOfDarts, vent=$backVent, band=$waistband', variation => {
    const spec = base();
    for (const key of Object.keys(spec.measurements)) spec.measurements[key] *= variation.size;
    Object.assign(spec.options, variation);
    delete spec.options.size;
    const p = generatePenelope(spec);
    for (const check of p.checks) expect(check.differenceMm).toBeLessThanOrEqual(check.toleranceMm);
    expect(p.vector.pieces).toHaveLength(variation.waistband ? 3 : 2);
    const back = p.vector.pieces.find(p => p.id === 'penelope.back')!;
    expect(back.onFold).toBe(false); expect(back.cutQuantity).toBe(2);
    expect(back.width).toBeGreaterThan(0);
  });
});

describe('curved-piece PDF export', () => {
  it.each(['A4', 'Letter'] as const)('tiles exact vectors on %s with calibration and correct cutting notes', async paperSize => {
    const p = generatePenelope(base()), paper = PAPER_SIZES[paperSize];
    const doc = await PDFDocument.load(await exportVectorPDF(p.vector, { paperSize }));
    const count = 1 + p.vector.pieces.reduce((n, piece) => n + planTiles(piece.width + 12, piece.height + 12,
      paper.width - 24, paper.height - 24, 10).tiles.length, 0);
    expect(doc.getPageCount()).toBe(count);
    for (const page of doc.getPages()) { expect(page.getWidth()).toBeCloseTo(paper.width * MM_TO_PT, 9); expect(page.getHeight()).toBeCloseTo(paper.height * MM_TO_PT, 9); }
    const content = doc.context.enumerateIndirectObjects().flatMap(([, o]) => o instanceof PDFRawStream ?
      [Buffer.from(decodePDFRawStream(o).decode()).toString('utf8')] : []).join('\n');
    expect(content).toMatch(/[-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ c/);
    expect(content).toContain(`${MM_TO_PT} 0 0 ${-MM_TO_PT}`);
    expect(content).toContain(`${50 * MM_TO_PT} 0 l`);
    expect(doc.catalog.getOrCreateViewerPreferences().getPrintScaling()).toBe('None');
  });
  it('reproduces identical PDF bytes from identical FreeSewing input', async () => {
    expect(await exportVectorPDF(generatePenelope(base()).vector)).toEqual(await exportVectorPDF(generatePenelope(base()).vector));
  });
});
