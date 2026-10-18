import { designs, i18n, annotationI18n, themePlugin, i18nPlugin } from '@pattern-studio/catalog-engine';
import { z } from 'zod';
import { escapeXML } from '../svg.js';
import type { VectorPattern, VectorPiece } from '../vector.js';
import { layoutData, type LayoutData, type LayoutPiece } from '../layout.js';
import { nativePartLayout, type LayoutNativePart } from './layout.js';

const translate = (text: unknown, locale: string): string => {
  const raw = String(text), colon = raw.indexOf(':');
  const design = i18n[colon < 0 ? '' : raw.slice(0, colon)]?.[locale];
  const key = raw.slice(colon + 1);
  return annotationI18n[locale]?.[raw] ?? design?.s?.[key] ?? design?.p?.[key] ?? raw;
};

export const CATALOG_ENGINE_VERSION = '4.10.2';
const commonSchema = z.strictObject({
  schemaVersion: z.literal(2), measurementSystem: z.literal('metric'),
  garment: z.strictObject({ designId: z.string().min(1), family: z.string().min(1), name: z.string().max(100).optional() }),
  measurements: z.record(z.string(), z.number().finite().positive().max(5000)),
  options: z.record(z.string(), z.union([z.number().finite(), z.boolean(), z.string()])).default({}),
  construction: z.strictObject({ seamAllowanceMm: z.number().finite().min(0).max(30).default(10) }).default({ seamAllowanceMm: 10 }),
  render: z.strictObject({ complete: z.literal(true).default(true), paperless: z.boolean().default(false) }).default({ complete: true, paperless: false }),
  print: z.strictObject({ paper: z.enum(['A4', 'Letter']).default('A4'), marginMm: z.number().finite().min(10).max(40).default(12),
    overlapMm: z.number().finite().min(0).max(50).default(10), calibrationSquareMm: z.literal(50).default(50) })
    .default({ paper: 'A4', marginMm: 12, overlapMm: 10, calibrationSquareMm: 50 }),
  fabric: z.strictObject({ structure: z.enum(['woven', 'knit', 'unknown']).optional(), stretchPct: z.number().min(0).max(100).optional(),
    shrinkagePct: z.number().min(0).max(100).optional(), directionalPrint: z.boolean().optional() }).optional(),
});
export type CatalogSpec = z.output<typeof commonSchema>;
export interface CatalogPattern {
  designId: string; engine: 'FreeSewing'; engineVersion: string; verification: 'untested'; spec: CatalogSpec;
  vector: VectorPattern; layout: LayoutData; instructions: string[]; warnings: string[];
}
export function validateCatalogSpec(input: unknown): CatalogSpec {
  const spec = commonSchema.parse(input), Constructor = designs[spec.garment.designId];
  if (!Constructor) throw new Error(`Unknown design '${spec.garment.designId}'. Select a registered FreeSewing design.`);
  const config = Constructor.patternConfig;
  const measurementShape: Record<string, z.ZodType> = {};
  for (const key of config.measurements) measurementShape[key] = z.number().finite().positive().max(key === 'shoulderSlope' ? 60 : 5000);
  for (const key of config.optionalMeasurements) if (!measurementShape[key])
    measurementShape[key] = z.number().finite().positive().max(key === 'shoulderSlope' ? 60 : 5000).optional();
  const optionShape: Record<string, z.ZodType> = {};
  for (const [key, value] of Object.entries(config.options)) {
    if (!value || typeof value !== 'object') continue;
    let validator: z.ZodType, inputKey = key;
    if ('bool' in value) validator = z.boolean();
    else if (Array.isArray(value.list)) validator = z.union([z.string(), z.number(), z.boolean()]).refine(v => value.list!.includes(v), `Choose one of: ${value.list.join(', ')}`);
    else {
      let number = z.number().finite();
      if ('count' in value) number = number.int();
      if (typeof value.min === 'number') number = number.min(value.min);
      if (typeof value.max === 'number') number = number.max(value.max);
      if ('pct' in value) inputKey += 'Pct';
      else if ('deg' in value) inputKey += 'Deg';
      else if (!('count' in value)) continue;
      validator = number;
    }
    optionShape[inputKey] = validator.optional();
  }
  if(spec.garment.designId==='waralee'&&spec.measurements.waistToHips!>=spec.measurements.crotchDepth!)
    throw new z.ZodError([{code:'custom',path:['measurements','waistToHips'],message:'Waralee needs waist-to-hip depth shorter than crotch depth. Recheck your saved/photo measurements.'}]);
  // Nest validation so errors retain measurements/options prefixes for the form.
  z.strictObject({ measurements: z.strictObject(measurementShape), options: z.strictObject(optionShape) })
    .parse({ measurements: spec.measurements, options: spec.options });
  for (const [part, whole] of [['waistBack', 'waist'], ['seatBack', 'seat'], ['crossSeamFront', 'crossSeam']])
    if (spec.measurements[part!] !== undefined && spec.measurements[whole!] !== undefined && spec.measurements[part!]! >= spec.measurements[whole!]!)
      throw new Error(`${part} must be smaller than ${whole}.`);
  return spec;
}
function cutLabel(info: NativeCutInfo | undefined): string {
  if (!info) return 'Follow the design cutting instructions';
  return Object.entries(info.materials ?? {}).flatMap(([fabric, cuts]) => cuts.map(c =>
    `${fabric}: CUT ${c.cut}${c.onFold || info.cutOnFold ? ' ON FOLD' : c.cut > 1 && !c.identical ? ' MIRRORED' : ''}${c.onBias ? ' ON BIAS' : ''}`)).join(' / ')
    || 'Follow the design cutting instructions';
}
export function generateCatalogPattern(input: unknown): CatalogPattern {
  const spec = validateCatalogSpec(input), Constructor = designs[spec.garment.designId]!;
  const config = Constructor.patternConfig, options: Record<string, unknown> = {};
  for (const [inputKey, value] of Object.entries(spec.options)) {
    const candidate = inputKey.endsWith('Pct') ? inputKey.slice(0, -3) : inputKey.endsWith('Deg') ? inputKey.slice(0, -3) : inputKey;
    const descriptor = config.options[candidate];
    options[candidate] = descriptor && typeof descriptor === 'object' && 'pct' in descriptor ? Number(value) / 100 : value;
  }
  const drafted = new Constructor({ measurements: spec.measurements, options, sa: spec.construction.seamAllowanceMm,
    complete: true, paperless: spec.render.paperless, units: 'metric', scale: 1, expand: true, locale: 'en',
    idPrefix: `studio-${spec.garment.designId}-` }).use(themePlugin).use(i18nPlugin, translate).draft();
  const logs = drafted.getLogs(), errors = [...logs.pattern.error, ...logs.sets.flatMap(s => s.error)];
  if (errors.length) throw new Error(`FreeSewing could not draft ${spec.garment.designId}: ${[...new Set(errors)].join('; ')}`);
  if(spec.garment.designId==='waralee')for(const set of drafted.parts)for(const part of Object.values(set))
    for(const [key,snippet] of Object.entries(part.snippets))if(snippet.def==='logo')delete part.snippets[key];
  // Render once: retain native transformed groups, text paths and cutting markings.
  // Build each root SVG ourselves because the packaged Defs serializer writes attributes instead of elements.
  drafted.render();
  const svg = drafted.svg, defs = Object.entries(svg.defs.list)
    .filter(([key])=>spec.garment.designId!=='waralee'||key!=='logo').map(([,value])=>value).join('\n');
  const cutlist = drafted.setStores[0]?.get('cutlist') ?? {};
  const pieces: VectorPiece[] = [];
  const layoutPieces: LayoutPiece[] = [];
  for (const [id, layout] of Object.entries(svg.layout)) {
    const stack = drafted.stacks[id]; if (!stack || !layout.svg.trim()) continue;
    const width = stack.width + 12, height = stack.height + 24;
    if (![width, height, stack.topLeft.x, stack.topLeft.y].every(Number.isFinite) || Math.min(width, height) <= 0)
      throw new Error(`Invalid bounds for ${id}. Try another option or measurement set.`);
    const nativeParts = [...stack.parts], info = cutlist[nativeParts[0]?.name ?? id];
    for (const part of nativeParts) if (!part.hidden) {
      // Waralee facings include their allowance directly in the native seamSeam path.
      const facing = spec.garment.designId === 'waralee' && ['waralee.facingFront','waralee.facingBack'].includes(part.name)
        ? part.paths.seamSeam : undefined;
      layoutPieces.push(...nativePartLayout(part, cutlist[part.name], id, spec.construction.seamAllowanceMm,
        facing ? {pathId:'seamSeam',ops:facing.ops} : undefined));
    }
    const label = cutLabel(info), name = id.replaceAll('.', ' · ');
    const labelSize = Math.min(3, (width - 12) / Math.max(1, label.length * 0.6));
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="freesewing" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">
<style><![CDATA[${svg.style}]]></style><defs>${defs}</defs>
<text x="6" y="6" font-size="3" fill="#111">${escapeXML(name)}</text>
<text x="6" y="11" font-size="${labelSize}" fill="#111">${escapeXML(label)}</text>
<g transform="translate(${6 - stack.topLeft.x} ${18 - stack.topLeft.y})">${layout.svg}</g></svg>`;
    const cuts = Object.values(info?.materials ?? {}).flat();
    pieces.push({ id, name, width, height, cutQuantity: cuts.reduce((n, c) => n + c.cut, 0),
      onFold: !!info?.cutOnFold || cuts.some(c => c.onFold), mirrored: cuts.some(c => c.cut > 1 && !c.identical),
      cuttingLabel: label, primitives: [], svg: markup });
  }
  if (!pieces.length) throw new Error('This design produced no visible pieces. Review its options and required measurements.');
  const warnings = [...new Set([...logs.pattern.warn, ...logs.sets.flatMap(s => s.warn)])];
  const name = spec.garment.name ?? Constructor.designConfig.data.name;
  return { designId: spec.garment.designId, engine: 'FreeSewing', engineVersion: CATALOG_ENGINE_VERSION, verification: 'untested', spec,
    layout: layoutData(layoutPieces), vector: { title: `${name} - FreeSewing (untested)`, units: 'mm', pieces,
      legend: 'Native FreeSewing markings: allowance outlines, seam lines, grain and fold marks.',
      cuttingInstructions: 'Follow the material, CUT, FOLD and BIAS labels for each native pattern piece.',
      constructionNote: 'Untested design. Follow the original design instructions and make a fit sample.' },
    instructions: [
      `${name} is enabled using FreeSewing ${CATALOG_ENGINE_VERSION}. It has not been garment-tested in this application.`,
      `Original design instructions: https://freesewing.eu/designs/${spec.garment.designId}/`,
      'Replace the example body measurements with your own. Use the fabric type and stretch requirements specified by the original design.',
      'Follow the native material-specific cutting quantities and fold/bias/grain markings. Stacked parts may include more than one material or template.',
      'Native FreeSewing line styles are preserved. Identify the seam-allowance outline for cutting; do not apply the gathered-skirt legend to these pieces.',
      'Print at Actual Size and check the calibration square. Make a toile before final fabric; no automatic seam-matching or wearer-fit checks have been performed for this design.',
      ...warnings.map(w => `FreeSewing note: ${w}`),
    ], warnings };
}

export interface NativeCutInfo { cutOnFold?: import('../geometry.js').Point[]; grain?: number; grainOrigin?: string; materials: Record<string, { cut: number; identical?: boolean; onFold?: boolean; onBias?: boolean }[]> }
export interface NativeDraft {
  parts: Record<string,{snippets:Record<string,{def:string}>}>[];
  use(plugin: unknown, data?: unknown): NativeDraft; draft(): NativeDraft; render(): string;
  getLogs(): { pattern: { error: string[]; warn: string[] }; sets: { error: string[]; warn: string[] }[] };
  setStores: { get(key: string): Record<string, NativeCutInfo> }[];
  stacks: Record<string, { width: number; height: number; topLeft: { x: number; y: number }; parts: Set<LayoutNativePart> }>;
  svg: { style: string; defs: { list: Record<string, string> }; layout: Record<string, { svg: string }> };
}
export interface NativeOption { bool?: boolean; pct?: number; deg?: number; count?: number; min?: number; max?: number; list?: (string | number | boolean)[] }
export interface NativeConstructor {
  new(settings: unknown): NativeDraft;
  patternConfig: { measurements: string[]; optionalMeasurements: string[]; options: Record<string, NativeOption | number | boolean> };
  designConfig: { data: { name: string } };
}
