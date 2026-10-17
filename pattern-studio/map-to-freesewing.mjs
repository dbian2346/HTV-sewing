import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(await readFile(join(root, 'design-catalog.json'), 'utf8'));
const knownMeasurements = JSON.parse(await readFile(join(root, 'measurement-catalog.json'), 'utf8')).measurements;

export function mapToFreeSewing(spec) {
  if (spec?.schemaVersion !== 2 || spec.measurementSystem !== 'metric')
    throw new Error('Expected schemaVersion 2 with metric measurements');
  const design = catalog.designs.find(item => item.designId === spec.garment?.designId);
  if (!design) throw new Error(`Unsupported designId: ${spec.garment?.designId}`);
  if (spec.garment.family !== design.family) throw new Error(`Family for ${design.designId} must be ${design.family}`);
  if (!spec.measurements || typeof spec.measurements !== 'object') throw new Error('Missing measurements object');
  if (!spec.options || typeof spec.options !== 'object') throw new Error('Missing options object');
  const missing = design.requiredMeasurements.filter(key => !Object.hasOwn(spec.measurements, key));
  if (missing.length) throw new Error(`Missing ${design.designId} measurements: ${missing.join(', ')}`);
  for (const [key, value] of Object.entries(spec.measurements)) {
    const info = knownMeasurements[key];
    if (!info) throw new Error(`Unsupported measurement: ${key}`);
    const max = info.unit === 'deg' ? 60 : 3000;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max)
      throw new Error(`${key} must be a finite ${info.unit} value greater than 0 and at most ${max}`);
  }
  for (const [part, whole] of [['waistBack','waist'], ['seatBack','seat'], ['crossSeamFront','crossSeam']])
    if (spec.measurements[part] !== undefined && spec.measurements[whole] !== undefined && spec.measurements[part] >= spec.measurements[whole])
      throw new Error(`${part} must be smaller than ${whole}`);
  const options = {};
  for (const [key, value] of Object.entries(spec.options)) {
    const binding = design.options[key];
    if (!binding) throw new Error(`Unsupported option for ${design.designId}: ${key}`);
    if (binding.type === 'enum') {
      if (!binding.values.includes(value)) throw new Error(`${key} must be one of: ${binding.values.join(', ')}`);
      options[binding.fsKey] = value;
      continue;
    }
    if (binding.type === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`${key} must be boolean`);
      options[binding.fsKey] = value;
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) ||
        (binding.type === 'integer' && !Number.isInteger(value)) ||
        value < binding.min || value > binding.max)
      throw new Error(`${key} must be ${binding.type} from ${binding.min} to ${binding.max}`);
    options[binding.fsKey] = binding.type === 'percent' ? value / 100 : value;
  }
  const sa = spec.construction?.seamAllowanceMm;
  if (typeof sa !== 'number' || !Number.isFinite(sa) || sa < 0 || sa > 30)
    throw new Error('seamAllowanceMm must be 0-30 mm');
  if (typeof spec.render?.complete !== 'boolean' || typeof spec.render?.paperless !== 'boolean')
    throw new Error('render.complete and render.paperless must be boolean');
  return {
    designId: design.designId,
    package: design.package,
    freesewingSettings: {
      measurements: { ...spec.measurements }, options, sa,
      complete: spec.render.complete, paperless: spec.render.paperless,
      units: 'metric', scale: 1,
    },
    print: spec.print,
    fabricMetadata: spec.fabric ?? null,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = resolve(process.argv[2] ?? join(root, 'examples/penelope.json'));
  const output = resolve(process.argv[3] ?? join(root, 'examples/penelope.mapped.json'));
  const spec = JSON.parse(await readFile(input, 'utf8'));
  await writeFile(output, JSON.stringify(mapToFreeSewing(spec), null, 2) + '\n');
  console.log(`Wrote ${output}`);
}
