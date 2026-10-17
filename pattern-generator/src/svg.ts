import type { Pattern } from './types.ts';

const escapeXml = (value: string) => value.replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[ch]!));

export function renderSvg(pattern: Pattern): string {
  const fmt = (n: number) => Number(n.toFixed(3));
  const lines = pattern.pieces.flatMap(piece => piece.lines.map(item => {
    const { from: a, to: b, kind } = item;
    const className = kind === 'grain' ? 'grain' : kind;
    return `<line class="${className}" x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(b.x)}" y2="${fmt(b.y)}"${kind === 'grain' ? ' marker-end="url(#arrow)"' : ''}/>`;
  })).join('\n');
  const labels = pattern.pieces.flatMap(piece => [
    ...piece.labels.map(label => `<text x="${fmt(label.at.x)}" y="${fmt(label.at.y)}" font-size="${label.sizeMm ?? 3.5}">${escapeXml(label.text)}</text>`),
    `<text x="${fmt(piece.origin.x + 3)}" y="${fmt(piece.origin.y + piece.heightMm / 2)}" font-size="3" writing-mode="tb">PLACE ON FOLD</text>`,
  ]).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(pattern.widthMm)}mm" height="${fmt(pattern.heightMm)}mm" viewBox="0 0 ${fmt(pattern.widthMm)} ${fmt(pattern.heightMm)}">
<title>${escapeXml(pattern.input.garment.name)} pattern at 1:1 scale</title>
<defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6 Z" fill="#34647b"/></marker></defs>
<style>.cut{stroke:#111;stroke-width:.5}.stitch{stroke:#777;stroke-width:.3;stroke-dasharray:3 2}.fold{stroke:#bd372f;stroke-width:.6;stroke-dasharray:5 2}.grain{stroke:#34647b;stroke-width:.5}.guide{stroke:#aaa;stroke-width:.25}text{font-family:Arial,sans-serif;fill:#222}</style>
<rect width="100%" height="100%" fill="white"/>
${lines}
${labels}
</svg>\n`;
}
