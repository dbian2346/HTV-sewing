import PDFKitDocument, * as pdfkit from 'pdfkit';
import Helvetica from 'pdfkit/standard-fonts/Helvetica';
import HelveticaBold from 'pdfkit/standard-fonts/HelveticaBold';
import HelveticaOblique from 'pdfkit/standard-fonts/HelveticaOblique';
import HelveticaBoldOblique from 'pdfkit/standard-fonts/HelveticaBoldOblique';
import * as svgConverter from 'svg-for-pdfkit';
const SVGtoPDF = (svgConverter as unknown as { SVGtoPDF: typeof import('svg-for-pdfkit') }).SVGtoPDF;
import { Buffer } from 'buffer';

/** Complete native SVG -> vector PDF; preserves transforms, symbols and text paths. */
export async function svgPDF(svg: string, widthPt: number, heightPt: number): Promise<Uint8Array> {
  if (Math.max(widthPt, heightPt) > 14400) throw new Error('Native piece exceeds the supported PDF page size. Reduce the design dimensions.');
  // Some SVG/font dependencies expect Buffer in browsers; no file/network access is used.
  if (!('Buffer' in globalThis)) Object.assign(globalThis, { Buffer });
  if ('registerStdFonts' in pdfkit) pdfkit.registerStdFonts(Helvetica, HelveticaBold, HelveticaOblique, HelveticaBoldOblique);
  const doc = new PDFKitDocument({ size: [widthPt, heightPt], margin: 0,
    info: { CreationDate: new Date('2000-01-01T00:00:00Z'), ModDate: new Date('2000-01-01T00:00:00Z') } });
  const chunks: Uint8Array[] = [];
  const result = new Promise<Uint8Array>((resolve, reject) => {
    doc.on('data', chunk => chunks.push(new Uint8Array(chunk)));
    doc.on('error', reject);
    doc.on('end', () => { const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } resolve(bytes); });
  });
  const warnings: string[] = [];
  try {
    SVGtoPDF(doc as never, svg, 0, 0, { width: widthPt, height: heightPt,
      fontCallback: (_family, weight, italic) => `Helvetica${Number(weight) >= 600 || weight === 'bold' ? (italic ? '-BoldOblique' : '-Bold') : italic ? '-Oblique' : ''}`,
      imageCallback: () => { throw new Error('External images are not supported in pattern exports.'); },
      documentCallback: () => { throw new Error('External SVG documents are not supported in pattern exports.'); },
      warningCallback: warning => { warnings.push(warning); } });
    doc.end();
  } catch (error) { doc.end(); await result.catch(() => {}); throw error; }
  const bytes = await result;
  if (warnings.length) throw new Error(`Native SVG export reported unsupported content: ${[...new Set(warnings)].slice(0, 4).join('; ')}`);
  return bytes;
}
