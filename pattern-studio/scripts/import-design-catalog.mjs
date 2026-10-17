import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Reads static designConfig/patternConfig metadata only. Never calls draft() or render().
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const collectionRoot = process.argv[2] && resolve(process.argv[2]);
if (!collectionRoot) throw new Error('Usage: node scripts/import-design-catalog.mjs <installed @freesewing/collection directory>');
const pkg = JSON.parse(await readFile(join(collectionRoot, 'package.json'), 'utf8'));
if (pkg.name !== '@freesewing/collection' || pkg.version !== '4.10.2') throw new Error('This metadata importer expects @freesewing/collection 4.10.2.');
const { designs } = await import(pathToFileURL(join(collectionRoot, 'src/index.mjs')).href);
const catalog = JSON.parse(await readFile(join(root, 'design-catalog.json'), 'utf8'));
const knownMeasurements = JSON.parse(await readFile(join(root, 'measurement-catalog.json'), 'utf8')).measurements;
const existing = new Map(catalog.designs.map(d => [d.designId, d]));

const familyOverrides = {
  albert: 'apron', benjamin: 'neckwear', trayvon: 'neckwear', bob: 'bib', cathrin: 'corset',
  florence: 'mask', library: 'partLibrary', lily: 'leggings', lumina: 'leggings', lumira: 'leggings',
  otis: 'romper', onyx: 'onePiece', opal: 'overalls', simone: 'shirt', wahid: 'waistcoat', walburga: 'costume',
};
function family(id, data) {
  if (familyOverrides[id]) return familyOverrides[id];
  const tags = data.tags ?? [];
  for (const [tag, category] of [['skirts', 'skirt'], ['blocks', 'block'], ['dresses', 'dress'],
    ['hats', 'hat'], ['bags', 'bag'], ['toys', 'toy'], ['coats', 'coat'], ['trousers', 'trousers'],
    ['swimwear', 'swimwear'], ['underwear', 'underwear'], ['costumes', 'costume'], ['tops', 'top'], ['accessories', 'accessory']])
    if (tags.includes(tag)) return category;
  return 'other';
}
function optionBinding(fsKey, option) {
  if (!option || typeof option !== 'object') return null; // internal constants are not user options
  let binding, inputKey = fsKey;
  if (Object.hasOwn(option, 'bool')) binding = { fsKey, type: 'boolean', default: option.bool };
  else if (Object.hasOwn(option, 'pct')) { inputKey += 'Pct'; binding = { fsKey, type: 'percent', default: option.pct }; }
  else if (Object.hasOwn(option, 'deg')) { inputKey += 'Deg'; binding = { fsKey, type: 'degrees', default: option.deg }; }
  else if (Object.hasOwn(option, 'count')) binding = { fsKey, type: 'integer', default: option.count };
  else if (Array.isArray(option.list)) binding = { fsKey, type: 'enum', values: option.list, default: option.dflt };
  else throw new Error(`Unrecognized option descriptor: ${fsKey}`);
  for (const key of ['min', 'max']) {
    if (typeof option[key] === 'number' && Number.isFinite(option[key])) binding[key] = option[key];
    else if (option[key] !== undefined) binding.dynamicBounds = true;
  }
  if (typeof option.menu === 'string') binding.menu = option.menu;
  else if (typeof option.menu === 'function') binding.conditionalMenu = true;
  if (typeof option.label === 'string') binding.label = option.label;
  return [inputKey, binding];
}
let added = 0;
for (const [id, Constructor] of Object.entries(designs)) {
  if (existing.has(id)) continue; // keep existing curated bindings and Penelope runtime status
  const data = Constructor.designConfig.data, config = Constructor.patternConfig;
  const requiredMeasurements = [...config.measurements].sort();
  const optionalMeasurements = [...config.optionalMeasurements].filter(key => !requiredMeasurements.includes(key)).sort();
  for (const key of [...requiredMeasurements, ...optionalMeasurements])
    if (!knownMeasurements[key]) throw new Error(`Missing measurement metadata: ${id}/${key}`);
  const options = Object.fromEntries(Object.entries(config.options).flatMap(([key, value]) => {
    const mapped = optionBinding(key, value); return mapped ? [mapped] : [];
  }));
  existing.set(id, {
    designId: id, family: family(id, data), name: data.name, package: `@freesewing/${id}`,
    description: data.description, tags: data.tags ?? [], difficulty: data.difficulty ?? null,
    techniques: data.techniques ?? [], designers: data.design, developers: data.code,
    runtimeStatus: 'not-enabled', testStatus: 'not-tested', fitValidated: false,
    metadataStatus: 'imported-unverified', metadataPackageVersion: pkg.version,
    source: `https://freesewing.dev/reference/designs/${id}/`,
    packageSource: `https://www.npmjs.com/package/@freesewing/${id}/v/${pkg.version}`,
    requiredMeasurements, optionalMeasurements, options,
  });
  added++;
}
catalog.catalogVersion = 2;
catalog.verifiedAgainst = 'Original six curated reference entries; additional entries imported from static @freesewing/collection 4.10.2 metadata. Importing does not verify drafting or fit.';
catalog.collectionSource = { package: pkg.name, version: pkg.version, importedOn: '2026-10-17', designCount: Object.keys(designs).length,
  source: 'https://www.npmjs.com/package/@freesewing/collection/v/4.10.2',
  note: 'Includes the reusable part library. Existing curated entries are preserved; added entries have not been drafted or tested.' };
catalog.optionConvention = 'Input percentage points are divided by 100. Boolean, integer, degree and enum values pass through unchanged. Imported defaults and numeric bounds come from package metadata; conditional availability and runtime validity are not evaluated.';
catalog.designs = [...existing.values()].sort((a, b) => a.designId.localeCompare(b.designId));
await writeFile(join(root, 'design-catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(`Added ${added} reference entries; catalog now has ${catalog.designs.length} entries. No designs drafted or tested.`);
