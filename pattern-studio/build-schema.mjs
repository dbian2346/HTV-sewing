import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(await readFile(join(root, 'design-catalog.json'), 'utf8'));
const measurements = JSON.parse(await readFile(join(root, 'measurement-catalog.json'), 'utf8')).measurements;
const number = (min, max) => ({ type: 'number', minimum: min, maximum: max });
const measurementProperties = Object.fromEntries(Object.entries(measurements).map(([key, info]) => [
  key, info.unit === 'deg' ? number(0, 60) : number(1, 3000),
]));
const optionSchema = option => {
  if (option.type === 'boolean') return { type: 'boolean' };
  if (option.type === 'enum') return { enum: option.values };
  return { type: option.type === 'integer' ? 'integer' : 'number', minimum: option.min, maximum: option.max };
};

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:garment-pattern-spec:2',
  title: 'Versioned garment pattern request v2',
  description: 'Canonical application input. Design-specific options are converted to FreeSewing settings by map-to-freesewing.mjs.',
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'measurementSystem', 'garment', 'measurements', 'options', 'construction', 'render', 'print'],
  properties: {
    schemaVersion: { const: 2 },
    measurementSystem: { const: 'metric' },
    garment: {
      type: 'object', additionalProperties: false, required: ['designId', 'family', 'name'],
      properties: {
        designId: { enum: catalog.designs.map(d => d.designId) },
        family: { enum: [...new Set(catalog.designs.map(d => d.family))] },
        name: { type: 'string', minLength: 1, maxLength: 80 },
      },
    },
    measurements: { type: 'object', additionalProperties: false, properties: measurementProperties },
    options: { type: 'object' },
    construction: {
      type: 'object', additionalProperties: false, required: ['seamAllowanceMm'],
      properties: { seamAllowanceMm: number(0, 30) },
    },
    render: {
      type: 'object', additionalProperties: false, required: ['complete', 'paperless'],
      properties: { complete: { type: 'boolean' }, paperless: { type: 'boolean' } },
    },
    print: {
      type: 'object', additionalProperties: false, required: ['paper', 'marginMm', 'overlapMm', 'calibrationSquareMm'],
      properties: {
        paper: { enum: ['A4', 'Letter'] }, marginMm: number(5, 25),
        overlapMm: number(0, 30), calibrationSquareMm: { const: 50 },
      },
    },
    fabric: {
      description: 'Metadata for downstream fabric planning; not passed to FreeSewing by this adapter.',
      type: 'object', additionalProperties: false,
      properties: {
        structure: { enum: ['woven', 'knit', 'unknown'] },
        stretchPct: number(0, 100), shrinkagePct: number(0, 30),
        directionalPrint: { type: 'boolean' },
      },
    },
  },
  oneOf: catalog.designs.map(design => ({
    title: `${design.designId} settings`,
    properties: {
      garment: { properties: { designId: { const: design.designId }, family: { const: design.family } } },
      measurements: { required: design.requiredMeasurements },
      options: { properties: Object.fromEntries(Object.entries(design.options).map(([key, option]) => [key, optionSchema(option)])), additionalProperties: false },
    },
  })),
};
await writeFile(join(root, 'garment-spec.schema.json'), JSON.stringify(schema, null, 2) + '\n');
console.log('Wrote garment-spec.schema.json');
