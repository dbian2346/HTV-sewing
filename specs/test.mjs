import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mapToFreeSewing } from './map-to-freesewing.mjs';
import { designs } from './design-registry.mjs';
import { renderSpec } from './render-design.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const load = async file => JSON.parse(await readFile(join(root, file), 'utf8'));
const catalog = await load('design-catalog.json');
const measurements = (await load('measurement-catalog.json')).measurements;
const schema = await load('garment-spec.schema.json');

for (const design of catalog.designs) {
  const Design = designs[design.designId];
  assert.ok(Design, `${design.designId}: no installed constructor`);
  assert.equal(Design.designConfig.data.pkg, design.package);
  const config = new Design().getConfig();
  assert.deepEqual([...config.measurements].sort(), [...design.requiredMeasurements].sort(), `${design.designId}: required measurements differ from installed package`);
  assert.deepEqual([...config.optionalMeasurements].sort(), [...design.optionalMeasurements].sort(), `${design.designId}: optional measurements differ from installed package`);
  for (const binding of Object.values(design.options))
    assert.ok(Object.hasOwn(config.options, binding.fsKey), `${design.designId}: missing installed option ${binding.fsKey}`);
  for (const key of [...design.requiredMeasurements, ...design.optionalMeasurements])
    assert.ok(measurements[key], `${design.designId}: unknown measurement ${key}`);
  const branch = schema.oneOf.find(item => item.properties.garment.properties.designId.const === design.designId);
  assert.deepEqual(branch.properties.measurements.required, design.requiredMeasurements);
  assert.deepEqual(Object.keys(branch.properties.options.properties).sort(), Object.keys(design.options).sort());
  for (const [key, value] of Object.entries(design.options)) {
    assert.ok(['boolean', 'integer', 'percent', 'degrees'].includes(value.type), `${design.designId}: ${key}`);
    if (value.type !== 'boolean') assert.ok(value.min <= value.max, `${design.designId}: ${key} range`);
  }
}

for (const design of catalog.designs) {
  const example = await load(`examples/${design.designId}.json`);
  const { svg, summary } = renderSpec(example);
  assert.equal(summary.designId, design.designId);
  assert.ok(summary.widthMm > 0 && summary.heightMm > 0);
  assert.match(svg, /<svg\b/);
  assert.match(svg, /<path\b/);
  assert.match(svg, new RegExp(`width="${summary.widthMm}mm"`));
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
console.log(`Catalog, schema branches, mapping, and SVG drafting verified for ${catalog.designs.length} designs.`);
