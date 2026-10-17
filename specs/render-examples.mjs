import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFile } from './render-design.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(process.argv[2] ?? join(root, 'rendered'));
for (const file of (await readdir(join(root, 'examples'))).filter(name => name.endsWith('.json') && !name.endsWith('.mapped.json')).sort()) {
  const id = file.slice(0, -5);
  const summary = await renderFile(join(root, 'examples', file), join(outputDir, `${id}.svg`));
  console.log(`${id}: ${summary.widthMm} × ${summary.heightMm} mm; ${summary.warnings.length} drafting warnings`);
}
