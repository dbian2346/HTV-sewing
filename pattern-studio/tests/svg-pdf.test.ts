import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { svgPDF } from '../src/svg-pdf.js';

async function operators(svg: string) {
  const pdf = await PDFDocument.load(await svgPDF(svg, 100, 100));
  return pdf.context.enumerateIndirectObjects()
    .flatMap(([, object]) => object instanceof PDFRawStream && !object.dict.has(PDFName.of('Subtype'))
      ? [new TextDecoder().decode(decodePDFRawStream(object).decode())] : []).join('\n');
}

describe('native SVG PDF line styles', () => {
  it('strokes closed outlines and dashed seam lines instead of filling pieces black', async () => {
    const content = await operators(`<svg xmlns="http://www.w3.org/2000/svg" class="freesewing" viewBox="0 0 100 100">
      <style><![CDATA[
        /* Native theme reset */ svg.freesewing path, svg.freesewing circle { fill: none; stroke: none; }
        /* Native theme defaults */ svg.freesewing path { stroke: #000; stroke-width: 0.3; }
        svg.freesewing .sa { stroke-dasharray: 0.4, 0.8; }
        svg.freesewing .hidden { stroke: none; fill: none; }
      ]]></style>
      <path d="M 10,10 L 90,10 L 90,90 L 10,90 Z"/>
      <path class="sa" d="M 15,15 L 85,15 L 85,85 L 15,85 Z"/>
      <path class="hidden" d="M 20,20 L 80,20 L 80,80 Z"/>
    </svg>`);
    expect(content.match(/^S$/gm)).toHaveLength(2);
    expect(content).not.toMatch(/^(?:f\*?|B\*?|b\*?)$/m);
    expect(content).toContain('0.3 w');
    expect(content).toContain('[0.4 0.8] 0 d');
  });
  it('retains intentional snippet fills', async () => {
    const content = await operators(`<svg xmlns="http://www.w3.org/2000/svg" class="freesewing" viewBox="0 0 100 100">
      <style>/* Reset */ svg.freesewing path { fill: none; stroke: #000; }
      svg.freesewing .fill-note { fill: #8b5cf6; }</style>
      <path class="fill-note" d="M 10,10 L 20,15 L 10,20 Z"/>
    </svg>`);
    expect(content).toMatch(/^B$/m);
  });
});
