import { generatePattern } from './draft.js';
import { generatePenelope } from './freesewing/penelope.js';
import { gatheredVectorPattern, exportVectorSVG, type VectorPattern, type VectorPiece } from './vector.js';
import { exportVectorPDF, type PDFOptions } from './pdf.js';
import type { PatternSpec } from './schema.js';
import type { PenelopeSpec } from './freesewing/schema.js';
import type { PenelopePattern } from './freesewing/penelope.js';
import type { Pattern } from './draft.js';
import { generateCatalogPattern, type CatalogSpec, type CatalogPattern } from './freesewing/catalog-runtime.js';

export type StudioSpec = PatternSpec | PenelopeSpec | CatalogSpec;
export interface StudioPattern {
  designId: string; title: string; spec: StudioSpec;
  vector: VectorPattern; pieces: VectorPiece[]; instructions: string[]; pdfOptions: PDFOptions;
  dimensions: { finishedLength: number | null; elasticCutLength: number | null; easedWaist: number | null };
  checks: { name: string; differenceMm: number; toleranceMm: number }[];
  draft: Pattern | PenelopePattern | CatalogPattern;
  verification?: 'untested';
}
export function isFreeSewingSpec(input: unknown): input is PenelopeSpec | CatalogSpec {
  return typeof input === 'object' && input !== null && 'schemaVersion' in input;
}
export function isPenelopeSpec(input: unknown): input is PenelopeSpec {
  return isFreeSewingSpec(input) && input.garment?.designId === 'penelope';
}
export function generateStudioPattern(input: unknown): StudioPattern {
  if (isFreeSewingSpec(input) && !isPenelopeSpec(input)) {
    const p = generateCatalogPattern(input);
    return { designId: p.designId, title: p.spec.garment.name ?? p.designId, spec: p.spec,
      vector: p.vector, pieces: p.vector.pieces, instructions: p.instructions, checks: [], draft: p, verification: 'untested',
      pdfOptions: { paperSize: p.spec.print.paper, margin: p.spec.print.marginMm, overlap: p.spec.print.overlapMm },
      dimensions: { finishedLength: null, elasticCutLength: null, easedWaist: null } };
  }
  if (isPenelopeSpec(input)) {
    const p = generatePenelope(input);
    return { designId: 'penelope', title: 'Penelope fitted skirt', spec: p.spec, vector: p.vector, pieces: p.vector.pieces, draft: p,
      instructions: p.instructions, checks: p.checks,
      pdfOptions: { paperSize: p.spec.print.paper, margin: p.spec.print.marginMm, overlap: p.spec.print.overlapMm },
      dimensions: { finishedLength: p.dimensions.finishedLength, elasticCutLength: null, easedWaist: p.dimensions.easedWaist } };
  }
  const p = generatePattern(input), vector = gatheredVectorPattern(p);
  return { designId: 'gathered_skirt', title: 'Gathered skirt', spec: p.spec, vector, pieces: vector.pieces, draft: p,
    instructions: p.instructions, checks: [], pdfOptions: {},
    dimensions: { finishedLength: p.dimensions.finishedLength, elasticCutLength: p.dimensions.elasticCutLength, easedWaist: null } };
}
export const exportStudioSVG = (pattern: StudioPattern) => exportVectorSVG({ ...pattern.vector, pieces: pattern.pieces });
export const exportStudioPDF = (pattern: StudioPattern, options: PDFOptions = {}) =>
  exportVectorPDF({ ...pattern.vector, pieces: pattern.pieces }, { ...pattern.pdfOptions, ...options });
