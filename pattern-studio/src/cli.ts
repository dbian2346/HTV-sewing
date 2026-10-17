import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateStudioPattern, exportStudioSVG, exportStudioPDF } from './index.js';

async function main() {
  const [input, output = 'output', paperSize, ...extra] = process.argv.slice(2);
  if (!input || extra.length || (paperSize !== undefined && !['A4', 'Letter'].includes(paperSize)))
    throw new Error('Usage: npm run generate -- <spec.json> [output-directory] [A4|Letter]');
  const pattern = generateStudioPattern(JSON.parse(await readFile(resolve(input), 'utf8')));
  const svg = exportStudioSVG(pattern);
  const pdf = await exportStudioPDF(pattern, paperSize ? { paperSize: paperSize as 'A4' | 'Letter' } : {});
  await mkdir(resolve(output), { recursive: true });
  await writeFile(resolve(output, 'pattern.json'), JSON.stringify(pattern.draft, null, 2) + '\n');
  await writeFile(resolve(output, 'pattern.svg'), svg);
  await writeFile(resolve(output, 'pattern.pdf'), pdf);
  console.log(`Generated ${pattern.pieces.length} pieces in ${resolve(output)} (mm, ${paperSize ?? pattern.pdfOptions.paperSize ?? 'A4'}, 100% scale).`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
