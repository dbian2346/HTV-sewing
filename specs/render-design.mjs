import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapToFreeSewing } from './map-to-freesewing.mjs';
import { designs } from './design-registry.mjs';

export function renderSpec(spec) {
  const mapped = mapToFreeSewing(spec);
  const Design = designs[mapped.designId];
  if (!Design) throw new Error(`No installed FreeSewing constructor for ${mapped.designId}`);
  const pattern = new Design(mapped.freesewingSettings);
  const config = pattern.getConfig();
  const missing = config.measurements.filter(key => !Object.hasOwn(mapped.freesewingSettings.measurements, key));
  if (missing.length) throw new Error(`Installed ${mapped.designId} requires: ${missing.join(', ')}`);
  for (const key of Object.keys(mapped.freesewingSettings.options))
    if (!Object.hasOwn(config.options, key)) throw new Error(`Installed ${mapped.designId} has no option ${key}`);
  const svg = pattern.draft().render().replace('<![CDATA[ \n', '<![CDATA[\n');
  const size = svg.match(/<svg\b[^>]*\bwidth="([\d.]+)mm"[^>]*\bheight="([\d.]+)mm"/s);
  if (!size || !Number.isFinite(Number(size[1])) || !Number.isFinite(Number(size[2])) ||
      Number(size[1]) <= 0 || Number(size[2]) <= 0 || !svg.includes('<path'))
    throw new Error(`${mapped.designId} produced an invalid or empty SVG`);
  const logs = pattern.getLogs();
  const errors = [logs.pattern, ...logs.sets].flatMap(section => section.error ?? []);
  if (errors.length) throw new Error(`${mapped.designId} drafting errors: ${errors.join('; ')}`);
  return { svg, summary: { designId: mapped.designId, package: mapped.package,
    packageVersion: Design.designConfig.data.version,
    widthMm: Number(size[1]), heightMm: Number(size[2]),
    warnings: [logs.pattern, ...logs.sets].flatMap(section => section.warn ?? []) } };
}

export async function renderFile(input, output) {
  const spec = JSON.parse(await readFile(input, 'utf8'));
  const result = renderSpec(spec);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, result.svg);
  await writeFile(output.replace(/\.svg$/i, '') + '.render.json', JSON.stringify(result.summary, null, 2) + '\n');
  return result.summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = resolve(process.argv[2] ?? 'examples/penelope.json');
  const output = resolve(process.argv[3] ?? 'rendered/penelope.svg');
  const summary = await renderFile(input, output);
  console.log(`Rendered ${summary.designId}: ${summary.widthMm} × ${summary.heightMm} mm → ${output}`);
}
