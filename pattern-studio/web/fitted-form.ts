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
export const fittedNames: Record<string, string> = {};
export function fittedExample(): unknown {
  return { schemaVersion: 2, measurementSystem: 'metric', garment: { designId: 'penelope', family: 'skirt', name: 'Penelope pencil skirt' },
    measurements: { waist: 760, seat: 1020, waistToHips: 190, waistToSeat: 230, waistToKnee: 590 },
    options: { curvedDarts: true, backVent: true, nrOfDarts: 2, waistband: true, waistEasePct: 1, seatEasePct: 1, lengthBonusPct: 0, hemBonusPct: 0 },
    construction: { seamAllowanceMm: 10 } };
}
function section(parent: HTMLElement, number: string, title: string) {
  const el = document.createElement('section'); el.className = 'form-section';
  const heading = document.createElement('div'); heading.className = 'section-heading';
  const num = document.createElement('span'); num.className = 'section-number'; num.textContent = number;
  const h = document.createElement('h3'); h.textContent = title; heading.append(num, h);
  const grid = document.createElement('div'); grid.className = 'field-grid';
  el.append(heading, grid); parent.append(el); return grid;
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
  const measurements = section(parent, '01', 'Your measurements');
  for (const key of [...design.requiredMeasurements]) field(measurements, `measurements.${key}`, measurementLabels[key]!, 'mm', 50, 2500);
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
