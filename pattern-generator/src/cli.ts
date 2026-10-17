import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeInput } from './validate.ts';
import { draftPattern } from './draft.ts';
import { renderSvg } from './svg.ts';
import { renderTiledPdf, planTiles } from './pdf.ts';

async function main() {
  const inputPath = resolve(process.argv[2] ?? 'examples/skirt.json');
  const outDir = resolve(process.argv[3] ?? 'generated');
  const input = normalizeInput(JSON.parse(await readFile(inputPath, 'utf8')));
  const pattern = draftPattern(input);
  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(resolve(outDir, 'pattern.svg'), renderSvg(pattern)),
    writeFile(resolve(outDir, 'pattern.pdf'), await renderTiledPdf(pattern)),
    writeFile(resolve(outDir, 'normalized-spec.json'), JSON.stringify(input, null, 2) + '\n'),
    writeFile(resolve(outDir, 'dimensions.json'), JSON.stringify({
      ...pattern.dimensions,
      pieces: pattern.pieces.map(piece => ({ id: piece.id, cut: piece.cutInstruction,
        cutWidthMm: piece.widthMm, cutHeightMm: piece.heightMm })),
      tiles: planTiles(pattern),
    }, null, 2) + '\n'),
  ]);
  console.log(`Wrote pattern.svg, pattern.pdf, normalized-spec.json and dimensions.json to ${outDir}`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
