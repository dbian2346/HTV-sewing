import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { normalizeInput } from '../src/validate.ts';
import { draftPattern } from '../src/draft.ts';
import { clipLine, MM_TO_PT, paperSizeMm, planTiles, renderTiledPdf } from '../src/pdf.ts';
import { renderSvg } from '../src/svg.ts';

const fixture = JSON.parse(await readFile(new URL('../examples/skirt.json', import.meta.url), 'utf8'));

test('cut widths unfold to the intended circumferences and length', () => {
  const pattern = draftPattern(normalizeInput(fixture));
  const [shell, band, ruffle] = pattern.pieces;
  const sa = pattern.input.construction.seamAllowanceMm;
  assert.equal(pattern.dimensions.shellCircumferenceMm, 1520);
  assert.equal(4 * (shell.widthMm - sa), 1520);
  assert.equal(2 * (band.widthMm - sa), 1520);
  assert.equal(4 * (ruffle.widthMm - sa), 2432);
  assert.equal(pattern.dimensions.shellVisibleHeightMm, 540);
  assert.equal(40 + 540 + 120, pattern.input.garment.finishedLengthMm);
  assert.equal(pattern.dimensions.elasticCutLengthMm, 750);
  assert.ok(shell.lines.some(l => l.kind === 'fold' && l.from.x === shell.origin.x));
  assert.ok(shell.lines.some(l => l.kind === 'grain'));
});

test('hip clearance raises effective fullness and ruffle can be omitted', () => {
  const raw = structuredClone(fixture);
  raw.garment.fullnessRatio = 1;
  raw.garment.ruffle.enabled = false;
  const pattern = draftPattern(normalizeInput(raw));
  assert.equal(pattern.dimensions.shellCircumferenceMm, 1100);
  assert.equal(pattern.pieces.length, 2);
  assert.equal(pattern.dimensions.shellVisibleHeightMm, 660);
  assert.equal(pattern.pieces[0].heightMm, 700);
});

test('validation catches impossible casing and missing measurements', () => {
  const raw = structuredClone(fixture);
  raw.garment.elasticWidthMm = 40;
  assert.throws(() => normalizeInput(raw), /waistband height/);
  delete raw.measurements.hipCircumferenceMm;
  assert.throws(() => normalizeInput(raw), /hipCircumferenceMm/);
  const extra = structuredClone(fixture);
  extra.garment.unexpected = 1;
  assert.throws(() => normalizeInput(extra), /unsupported fields/);
});

test('SVG declares exact millimeter dimensions and contains pattern markings', () => {
  const pattern = draftPattern(normalizeInput(fixture));
  const svg = renderSvg(pattern);
  assert.match(svg, /width="[\d.]+mm" height="[\d.]+mm"/);
  assert.match(svg, /PLACE ON FOLD/);
  assert.match(svg, /class="grain"/);
});

test('PDF tile plan, clipping and actual A4 page dimensions', async () => {
  const pattern = draftPattern(normalizeInput(fixture));
  const plan = planTiles(pattern);
  assert.equal(plan.stepX, 180);
  assert.equal(plan.stepY, 267);
  assert.deepEqual(clipLine({ from: { x: -10, y: 5 }, to: { x: 20, y: 5 }, kind: 'cut' }, 0, 0, 10, 10)?.from, { x: 0, y: 5 });
  const doc = await PDFDocument.load(await renderTiledPdf(pattern));
  assert.equal(doc.getPageCount(), 1 + plan.cols * plan.rows);
  const [w, h] = paperSizeMm('A4');
  assert.ok(Math.abs(doc.getPage(0).getWidth() - w * MM_TO_PT) < 0.01);
  assert.ok(Math.abs(doc.getPage(0).getHeight() - h * MM_TO_PT) < 0.01);
});

test('Letter output keeps the same millimeter geometry', async () => {
  const raw = structuredClone(fixture);
  raw.print.paper = 'Letter';
  const pattern = draftPattern(normalizeInput(raw));
  const pdf = await PDFDocument.load(await renderTiledPdf(pattern));
  const [w, h] = paperSizeMm('Letter');
  assert.ok(Math.abs(pdf.getPage(0).getWidth() - w * MM_TO_PT) < 0.01);
  assert.ok(Math.abs(pdf.getPage(0).getHeight() - h * MM_TO_PT) < 0.01);
  assert.equal(pattern.dimensions.shellCircumferenceMm, 1520);
});
