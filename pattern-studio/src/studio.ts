import { generatePattern } from './draft.js';
import { generatePenelope } from './freesewing/penelope.js';
import { gatheredVectorPattern, exportVectorSVG, type VectorPattern, type VectorPiece } from './vector.js';
import { exportVectorPDF, type PDFOptions } from './pdf.js';
import type { PatternSpec } from './schema.js';
import type { PenelopeSpec } from './freesewing/schema.js';
import type { PenelopePattern } from './freesewing/penelope.js';
import type { Pattern } from './draft.js';
import { generateCatalogPattern, type CatalogSpec, type CatalogPattern } from './freesewing/catalog-runtime.js';
import { layoutData, makeLayoutPieces, type LayoutData } from './layout.js';
import { corners } from './geometry.js';

export type StudioSpec = PatternSpec | PenelopeSpec | CatalogSpec;
export interface StudioPattern {
  designId: string; title: string; spec: StudioSpec;
  vector: VectorPattern; pieces: VectorPiece[]; instructions: string[]; pdfOptions: PDFOptions;
  layout: LayoutData;
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
      vector: p.vector, pieces: p.vector.pieces, layout: p.layout, instructions: p.instructions, checks: [], draft: p, verification: 'untested',
      pdfOptions: { paperSize: p.spec.print.paper, margin: p.spec.print.marginMm, overlap: p.spec.print.overlapMm },
      dimensions: { finishedLength: null, elasticCutLength: null, easedWaist: null } };
  }
  if (isPenelopeSpec(input)) {
    const p = generatePenelope(input);
    return { designId: 'penelope', title: 'Penelope fitted skirt', spec: p.spec, vector: p.vector, pieces: p.vector.pieces, layout:p.layout, draft: p,
      instructions: p.instructions, checks: p.checks,
      pdfOptions: { paperSize: p.spec.print.paper, margin: p.spec.print.marginMm, overlap: p.spec.print.overlapMm },
      dimensions: { finishedLength: p.dimensions.finishedLength, elasticCutLength: null, easedWaist: p.dimensions.easedWaist } };
  }
  const p = generatePattern(input), vector = gatheredVectorPattern(p);
  const layout = layoutData(p.pieces.flatMap(piece=>makeLayoutPieces({id:piece.id,name:piece.name,svgGroupId:piece.id,pathId:'cut',
    ops:[...corners(piece.cut).map((to,i)=>({type:i === 0 ? 'move' as const : 'line' as const,to})),{type:'close'}],
    materials:{fabric:[{cut:piece.cutQuantity,identical:true}]},grain:piece.grainline})));
  return { designId: 'gathered_skirt', title: 'Gathered skirt', spec: p.spec, vector, pieces: vector.pieces, draft: p,
    layout, instructions: p.instructions, checks: [], pdfOptions: {},
    dimensions: { finishedLength: p.dimensions.finishedLength, elasticCutLength: p.dimensions.elasticCutLength, easedWaist: null } };
}
export const exportStudioSVG = (pattern: StudioPattern) => exportVectorSVG({ ...pattern.vector, pieces: pattern.pieces });
/** JSON-safe optimizer metadata alongside the unchanged full-scale SVG. Fabric dimensions are separate optimizer inputs. */
export const exportStudioArtifacts = (pattern: StudioPattern) => ({ svg: exportStudioSVG(pattern),
  layout: { ...pattern.layout, pieces: pattern.layout.pieces.filter(piece=>pattern.pieces.some(p=>p.id===piece.source.svg_group_id)) } });
export const exportStudioPDF = (pattern: StudioPattern, options: PDFOptions = {}) =>
  exportVectorPDF({ ...pattern.vector, pieces: pattern.pieces }, { ...pattern.pdfOptions, ...options });
