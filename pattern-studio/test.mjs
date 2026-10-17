import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mapToFreeSewing } from './map-to-freesewing.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const load = async file => JSON.parse(await readFile(join(root, file), 'utf8'));
const catalog = await load('design-catalog.json');
const measurements = (await load('measurement-catalog.json')).measurements;
const schema = await load('garment-spec.schema.json');

for (const design of catalog.designs) {
  for (const key of [...design.requiredMeasurements, ...design.optionalMeasurements])
    assert.ok(measurements[key], `${design.designId}: unknown measurement ${key}`);
  const branch = schema.oneOf.find(item => item.properties.garment.properties.designId.const === design.designId);
  assert.deepEqual(branch.properties.measurements.required, design.requiredMeasurements);
  assert.deepEqual(Object.keys(branch.properties.options.properties).sort(), Object.keys(design.options).sort());
  for (const [key, value] of Object.entries(design.options)) {
    assert.ok(['boolean', 'integer', 'percent', 'degrees', 'enum'].includes(value.type), `${design.designId}: ${key}`);
    if (value.type === 'enum') assert.ok(Array.isArray(value.values) && value.values.length > 0, `${design.designId}: ${key} choices`);
    else if (value.type !== 'boolean' && value.min !== undefined && value.max !== undefined)
      assert.ok(value.min <= value.max, `${design.designId}: ${key} range`);
  }
}

const penelope = await load('examples/penelope.json');
const settings = mapToFreeSewing(penelope).freesewingSettings;
assert.equal(settings.sa, 10);
assert.equal(settings.options.waistEase, 0.01);
assert.equal(settings.options.nrOfDarts, 2);
assert.deepEqual(mapToFreeSewing(await load('examples/titan.json')).freesewingSettings.options,
  { waistEase: 0.02, seatEase: 0.02, kneeEase: 0.06, fitKnee: false });
const missing = structuredClone(penelope);
delete missing.measurements.waist;
assert.throws(() => mapToFreeSewing(missing), /Missing penelope measurements/);
const unsupported = structuredClone(penelope);
unsupported.options.unknownStyle = true;
assert.throws(() => mapToFreeSewing(unsupported), /Unsupported option/);
console.log(`Catalog, schema branches, two examples, and option mapping verified for ${catalog.designs.length} designs.`);
