import data from '../design-catalog.json';
import measurementsData from '../measurement-catalog.json';
import { designs } from '@pattern-studio/catalog-engine';
import type { CatalogSpec } from '../src/index.js';

interface Binding { fsKey: string; type: string; min?: number; max?: number; default?: string | number | boolean; values?: (string | number | boolean)[]; menu?: string; label?: string }
export interface CatalogEntry { designId: string; family: string; name: string; description?: string; requiredMeasurements: string[]; optionalMeasurements: string[]; options: Record<string, Binding> }
export const catalogEntries: CatalogEntry[] = (data.designs as unknown as CatalogEntry[]).map(entry => {
  if (entry.designId === 'penelope') return entry;
  const config = designs[entry.designId]!.patternConfig;
  const options: Record<string, Binding> = {};
  for (const [key, value] of Object.entries(config.options)) {
    if (!value || typeof value !== 'object') continue;
    const type = 'bool' in value ? 'boolean' : Array.isArray(value.list) ? 'enum' : 'pct' in value ? 'percent' : 'deg' in value ? 'degrees' : 'count' in value ? 'integer' : null;
    if (!type) continue;
    const inputKey = key + (type === 'percent' ? 'Pct' : type === 'degrees' ? 'Deg' : '');
    options[inputKey] = { fsKey: key, type, min: value.min, max: value.max, values: value.list,
      default: value.bool ?? value.pct ?? value.deg ?? value.count };
  }
  return { ...entry, requiredMeasurements: config.measurements, optionalMeasurements: config.optionalMeasurements, options };
});
export const catalogPaths: Record<string, string> = {}, catalogNames: Record<string, string> = {};
const label = (key: string) => key.replace(/Pct$/, '').replace(/Deg$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const demos: Record<string, number> = { ankle: 240, biceps: 320, bustFront: 500, bustPointToUnderbust: 100, bustSpan: 190,
  chest: 1000, crossSeam: 770, crossSeamFront: 350, crotchDepth: 280, head: 560, heel: 350, highBust: 940, highBustFront: 460,
  hips: 1000, hpsToBust: 300, hpsToWaistBack: 440, hpsToWaistFront: 460, inseam: 800, knee: 400, neck: 380,
  seat: 1020, seatBack: 530, shoulderSlope: 15, shoulderToElbow: 350, shoulderToShoulder: 420, shoulderToWrist: 610,
  underbust: 850, upperLeg: 590, waist: 760, waistBack: 390, waistToArmpit: 220, waistToFloor: 1060, waistToHips: 190,
  waistToKnee: 590, waistToSeat: 230, waistToUnderbust: 150, waistToUpperLeg: 320, wrist: 170 };
export function catalogExample(id: string): CatalogSpec {
  const design = catalogEntries.find(d => d.designId === id); if (!design) throw new Error(`Unknown design ${id}`);
  return { schemaVersion: 2, measurementSystem: 'metric', garment: { designId: id, family: design.family, name: design.name },
    measurements: Object.fromEntries(design.requiredMeasurements.map(key => [key, demos[key] ?? 400])), options: {},
    construction: { seamAllowanceMm: 10 }, render: { complete: true, paperless: false },
    print: { paper: 'A4', marginMm: 12, overlapMm: 10, calibrationSquareMm: 50 } };
}
export function populateDesigns(select: HTMLSelectElement) {
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const d of catalogEntries) {
    if (d.designId === 'penelope') continue;
    let group = groups.get(d.family);
    if (!group) { group = document.createElement('optgroup'); group.label = label(d.family); groups.set(d.family, group); }
    group.append(new Option(`${d.name} · untested`, d.designId));
  }
  for (const [, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) select.append(group);
}
function section(parent: HTMLElement, title: string, help: string): HTMLElement {
  const el = document.createElement('section'); el.className = 'form-section';
  const h = document.createElement('h3'); h.className = 'catalog-section-title'; h.textContent = title;
  const p = document.createElement('p'); p.className = 'field-help'; p.textContent = help;
  const fields = document.createElement('div'); fields.className = 'field-grid'; el.append(h, p, fields); parent.append(el); return fields;
}
function field(parent: HTMLElement, path: string, title: string, unit: string, min?: number, max?: number, optional = false, placeholder = '') {
  const name = `catalog-${path.replaceAll('.', '-')}`; catalogPaths[path] = name; catalogNames[name] = title;
  const outer = document.createElement('label'); outer.className = 'field'; outer.textContent = title + (optional ? ' (optional)' : '');
  const wrap = document.createElement('div'); wrap.className = 'input-wrap'; const input = document.createElement('input');
  input.name = name; input.type = 'number'; input.step = 'any'; input.required = !optional; input.placeholder = placeholder;
  if (min !== undefined) input.min = String(min); if (max !== undefined) input.max = String(max);
  const suffix = document.createElement('span'); suffix.textContent = unit; wrap.append(input, suffix); outer.append(wrap); parent.append(outer);
}
export function mountCatalogForm(parent: HTMLElement, id: string) {
  const design = catalogEntries.find(d => d.designId === id)!;
  parent.replaceChildren(); for (const key of Object.keys(catalogPaths)) delete catalogPaths[key];
  for (const key of Object.keys(catalogNames)) delete catalogNames[key];
  const required = section(parent, 'Required measurements', 'Enter your actual measurements. Required values are never inferred from your photo.');
  const descriptions = measurementsData.measurements as Record<string, { description: string; unit: string }>;
  for (const key of design.requiredMeasurements) field(required, `measurements.${key}`, label(key), descriptions[key]?.unit ?? 'mm', 0.01, key === 'shoulderSlope' ? 60 : 5000);
  if (design.optionalMeasurements.length) {
    const optional = section(parent, 'Optional measurements', 'Leave blank to use the design’s own measurement handling.');
    for (const key of design.optionalMeasurements) field(optional, `measurements.${key}`, label(key), descriptions[key]?.unit ?? 'mm', 0.01, 5000, true);
  }
  const options = section(parent, 'Design options', 'Blank / Design default keeps FreeSewing’s default. Percentage values are percentage points. Conditional options remain visible for this untested integration.');
  for (const [key, binding] of Object.entries(design.options)) {
    const path = `options.${key}`, title = binding.label ?? label(key);
    if (binding.type === 'boolean' || binding.type === 'enum') {
      const name = `catalog-${path.replaceAll('.', '-')}`; catalogPaths[path] = name; catalogNames[name] = title;
      const outer = document.createElement('label'); outer.className = 'field'; outer.textContent = title;
      const select = document.createElement('select'); select.name = name; select.className = 'catalog-choice'; select.append(new Option('Design default', ''));
      const values = binding.type === 'boolean' ? [true, false] : binding.values ?? [];
      for (const [i, value] of values.entries()) select.append(new Option(binding.type === 'boolean' ? value ? 'Yes' : 'No' : String(value), String(i)));
      select.dataset.values = JSON.stringify(values); outer.append(select); options.append(outer);
    } else {
      field(options, path, title, binding.type === 'percent' ? '%' : binding.type === 'degrees' ? '°' : '', binding.min, binding.max, true,
        binding.default === undefined ? 'Design default' : `Default: ${binding.default}`);
      if (binding.type === 'integer') options.lastElementChild!.querySelector('input')!.step = '1';
    }
  }
  const finish = section(parent, 'Construction', 'Hem, fabric and assembly requirements are specific to the original design. See Sewing notes.');
  field(finish, 'construction.seamAllowanceMm', 'Seam allowance', 'mm', 0, 30);
}
export function writeCatalogForm(form: HTMLFormElement, spec: CatalogSpec) {
  for (const [path, name] of Object.entries(catalogPaths)) {
    const [group, key] = path.split('.') as [keyof CatalogSpec, string];
    const value = (spec[group] as Record<string, unknown>)[key];
    const input = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
    if (input instanceof HTMLSelectElement) {
      const values = JSON.parse(input.dataset.values!) as unknown[];
      input.value = value === undefined ? '' : String(values.indexOf(value));
    } else input.value = value === undefined ? '' : String(value);
  }
}
export function readCatalogForm(form: HTMLFormElement, retained: CatalogSpec): CatalogSpec {
  const spec = structuredClone(retained);
  for (const [path, name] of Object.entries(catalogPaths)) {
    const [group, key] = path.split('.') as [keyof CatalogSpec, string];
    const target = spec[group] as Record<string, unknown>, input = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
    if (input.value === '' && (input instanceof HTMLSelectElement || !input.required)) delete target[key];
    else target[key] = input instanceof HTMLSelectElement ? (JSON.parse(input.dataset.values!) as unknown[])[Number(input.value)] : input.valueAsNumber;
  }
  return spec;
}
