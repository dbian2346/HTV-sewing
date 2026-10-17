import type { Pattern } from './draft.js';
import { piecePrimitives, type PatternPiece } from './geometry.js';

export const escapeXML = (s: string) => s.replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
export interface Placement { piece: PatternPiece; x: number; y: number }
export function layoutPattern(pattern: Pattern, gap = 15) {
  let y = gap;
  const placements: Placement[] = pattern.pieces.map(piece => {
    const placement = { piece, x: gap, y }; y += piece.cut.height + gap; return placement;
  });
  return { width: Math.max(...pattern.pieces.map(p => p.cut.width)) + 2 * gap, height: y, placements };
}
export function exportSVG(pattern: Pattern): string {
  const layout = layoutPattern(pattern);
  const groups = layout.placements.map(({ piece, x, y }) => {
    const shapes = piecePrimitives(piece).map(primitiveSVG).join('\n');
    return `<g id="${escapeXML(piece.id)}" transform="translate(${x} ${y})">${shapes}</g>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}mm" height="${layout.height}mm" viewBox="0 0 ${layout.width} ${layout.height}">
<title>Gathered skirt sewing pattern - full scale millimetres</title>
<desc>Solid: cut. Dashed: stitching or finished hem. Dot-dash: fold. Cut every piece once on a single layer.</desc>
<style>path{fill:none;stroke:#111;stroke-width:.3} .stitch{stroke-dasharray:3 2;stroke-width:.2} .fold{stroke-dasharray:5 1 1 1;stroke-width:.2} .annotation{stroke-width:.2} text{font-family:Arial,sans-serif;fill:#111}</style>
${groups.join('\n')}
</svg>\n`;
}

export function primitiveSVG(p: import('./geometry.js').Primitive): string {
  if (p.kind === 'text') return `<text x="${p.at.x}" y="${p.at.y}" font-size="${p.size}"${p.rotation ? ` transform="rotate(${p.rotation} ${p.at.x} ${p.at.y})"` : ''}>${escapeXML(p.text)}</text>`;
  return `<path class="${p.style}" d="${p.kind === 'path' ? escapeXML(p.d) : `M ${p.from.x} ${p.from.y} L ${p.to.x} ${p.to.y}`}"/>`;
}
