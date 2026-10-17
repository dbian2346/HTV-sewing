import catalog from '../design-catalog.json';
import { penelopeSchema, type PenelopeSpec } from '../src/index.js';

// Read the common catalog shape instead of inferring a union of every design's option keys.
const design = (catalog as unknown as { designs: { designId: string; requiredMeasurements: string[]; optionalMeasurements: string[];
  options: Record<string, { type: string; min?: number; max?: number }> }[] }).designs.find(d => d.designId === 'penelope')!;
export const fittedPaths: Record<string, string> = {};
const measurementLabels: Record<string, string> = {
  waist: 'Waist circumference', seat: 'Seat circumference', waistToHips: 'Waist to high hip',
  waistToSeat: 'Waist to full seat', waistToKnee: 'Waist to knee', waistBack: 'Back waist arc', seatBack: 'Back seat arc',
};
const optionLabels: Record<string, string> = {
  curvedDarts: 'Curved darts', backVent: 'Back vent', nrOfDarts: 'Darts per half panel', waistband: 'Add a waistband',
  lengthBonusPct: 'Body length adjustment', hemBonusPct: 'Hem taper', waistEasePct: 'Waist ease', seatEasePct: 'Seat ease',
};
export const fittedNames: Record<string, string> = {};
export function fittedExample(): unknown {
  return { schemaVersion: 2, measurementSystem: 'metric', garment: { designId: 'penelope', family: 'skirt', name: 'Penelope pencil skirt' },
    measurements: { waist: 760, seat: 1020, waistToHips: 190, waistToSeat: 230, waistToKnee: 590 },
    options: { curvedDarts: true, backVent: true, nrOfDarts: 2, waistband: true, waistEasePct: 1, seatEasePct: 1, lengthBonusPct: 0, hemBonusPct: 0 },
    construction: { seamAllowanceMm: 10 } };
}
function section(parent: HTMLElement, number: string, title: string, help: string) {
  const el = document.createElement('section'); el.className = 'form-section';
  const heading = document.createElement('div'); heading.className = 'section-heading';
  const num = document.createElement('span'); num.className = 'section-number'; num.textContent = number;
  const h = document.createElement('h3'); h.textContent = title; heading.append(num, h);
  const grid = document.createElement('div'); grid.className = 'field-grid';
  const p = document.createElement('p'); p.className = 'field-help'; p.textContent = help;
  el.append(heading, grid, p); parent.append(el); return grid;
}
function field(parent: HTMLElement, path: string, title: string, unit: string, min: number, max: number, optional = false) {
  const name = `fs-${path.replaceAll('.', '-')}`;
  fittedPaths[path] = name; fittedNames[name] = title;
  const label = document.createElement('label'); label.className = 'field'; label.textContent = title + (optional ? ' (optional)' : '');
  const wrap = document.createElement('div'); wrap.className = 'input-wrap';
  const input = document.createElement('input'); input.name = name; input.type = 'number'; input.min = String(min); input.max = String(max);
  input.step = 'any'; input.required = !optional;
  const suffix = document.createElement('span'); suffix.textContent = unit; wrap.append(input, suffix); label.append(wrap); parent.append(label);
}
export function mountFittedForm(parent: HTMLElement) {
  const measurements = section(parent, '01', 'Penelope measurements', 'Seat is the fullest part of your buttocks, not the high hip. Vertical measurements start at your natural waist.');
  for (const key of [...design.requiredMeasurements]) field(measurements, `measurements.${key}`, measurementLabels[key]!, 'mm', 50, 2500);
  const arcs = section(parent, '02', 'Optional back arcs', 'Measure the back half from side seam to side seam. Supply both arcs, or leave both empty for FreeSewing’s default balance.');
  for (const key of design.optionalMeasurements) field(arcs, `measurements.${key}`, measurementLabels[key]!, 'mm', 50, 2500, true);
  const options = section(parent, '03', 'Supported variations', 'Length adjusts the waist-to-knee body length. The waistband adds height above it. Taper changes the hem shape; ease values are percentage points.');
  for (const [key, binding] of Object.entries(design.options)) {
    if (binding.type === 'boolean') {
      const name = `fs-options-${key}`; fittedPaths[`options.${key}`] = name; fittedNames[name] = optionLabels[key]!;
      const label = document.createElement('label'); label.className = 'fitted-checkbox';
      const input = document.createElement('input'); input.type = 'checkbox'; input.name = name;
      label.append(input, document.createTextNode(optionLabels[key]!)); options.append(label);
    } else {
      const numeric = binding as { min: number; max: number; type: string };
      field(options, `options.${key}`, optionLabels[key]!, binding.type === 'integer' ? '' : '%', numeric.min, numeric.max);
      if (binding.type === 'integer') (options.lastElementChild!.querySelector('input')!).step = '1';
    }
  }
  const finish = section(parent, '04', 'Seam allowance', 'Penelope drafts its own hem turn-up. This variation uses a back zipper and a waistband with no button overlap. Cut quantities and fold edges are design-specific.');
  field(finish, 'construction.seamAllowanceMm', 'Seam allowance', 'mm', 0, 30);
}
export function readFittedForm(form: HTMLFormElement, retained: PenelopeSpec | null) {
  const spec = JSON.parse(JSON.stringify(retained ?? penelopeSchema.parse(fittedExample()))) as PenelopeSpec;
  for (const [path, name] of Object.entries(fittedPaths)) {
    const input = form.elements.namedItem(name) as HTMLInputElement;
    const [group, key] = path.split('.') as [keyof PenelopeSpec, string];
    const target = spec[group] as Record<string, unknown>;
    if (input.type === 'checkbox') target[key] = input.checked;
    else if (!input.required && input.value === '') delete target[key];
    else target[key] = input.valueAsNumber;
  }
  return spec;
}
