import type { Primitive } from './geometry.js';
import { escapeXML, primitiveSVG } from './svg.js';
import { piecePrimitives } from './geometry.js';
import type { Pattern } from './draft.js';

/** width and height bound the actual paths; they are not rectangular cutting outlines. */
export interface VectorPiece {
  id: string; name: string; width: number; height: number;
  cutQuantity: number; onFold: boolean; mirrored: boolean;
  primitives: Primitive[];
  svg?: string;
  cuttingLabel?: string;
}
export interface VectorPattern {
  title: string; units: 'mm'; pieces: VectorPiece[];
  cuttingInstructions: string; constructionNote: string;
  legend?: string;
}
export function gatheredVectorPattern(pattern: Pattern): VectorPattern {
  return { title: 'Gathered skirt - full-scale sewing pattern', units: 'mm',
    pieces: pattern.pieces.map(p => ({ id: p.id, name: p.name, width: p.cut.width, height: p.cut.height,
      cutQuantity: p.cutQuantity, onFold: false, mirrored: false, primitives: piecePrimitives(p) })),
    cuttingInstructions: 'Cut each piece once, single layer. The waistband folds along its center line.',
    constructionNote: 'Construction steps and elastic lengths are in the generated pattern JSON.' };
}
export function exportVectorSVG(pattern: VectorPattern): string {
  const gap = 15, width = Math.max(...pattern.pieces.map(p => p.width)) + gap * 2;
  let y = gap;
  const groups = pattern.pieces.map(piece => {
    const content = piece.svg ? piece.svg.replace(/width="[^\"]+mm"/, `width="${piece.width}"`).replace(/height="[^\"]+mm"/, `height="${piece.height}"`) : piece.primitives.map(primitiveSVG).join('\n');
    const group = `<g id="${escapeXML(piece.id)}" transform="translate(${gap} ${y})">${content}</g>`;
    y += piece.height + gap; return group;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${y}mm" viewBox="0 0 ${width} ${y}">
<title>${escapeXML(pattern.title)}</title>
<desc>${escapeXML(pattern.cuttingInstructions)}</desc>
<style>path{fill:none;stroke:#111;stroke-width:.3}.stitch{stroke-dasharray:3 2;stroke-width:.2}.fold{stroke-dasharray:5 1 1 1;stroke-width:.2}.annotation{stroke-width:.2}text{font-family:Arial,sans-serif;fill:#111}</style>
${groups.join('\n')}
</svg>\n`;
}
