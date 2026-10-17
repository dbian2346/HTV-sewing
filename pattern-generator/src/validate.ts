import type { PatternInput } from './types.ts';

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}
function number(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`${name} must be a finite number from ${min} to ${max}`);
  return value;
}
function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 80)
    throw new Error(`${name} must be 1-80 characters`);
  return value.trim();
}
function onlyKeys(value: Record<string, unknown>, name: string, allowed: string[]): void {
  const extra = Object.keys(value).filter(key => !allowed.includes(key));
  if (extra.length) throw new Error(`${name} has unsupported fields: ${extra.join(', ')}`);
}

export function normalizeInput(raw: unknown): PatternInput {
  const root = object(raw, 'input');
  if (root.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  const g = object(root.garment, 'garment');
  const m = object(root.measurements, 'measurements');
  const c = object(root.construction, 'construction');
  const p = object(root.print, 'print');
  const r = object(g.ruffle, 'garment.ruffle');
  onlyKeys(root, 'input', ['schemaVersion', 'garment', 'measurements', 'construction', 'print']);
  onlyKeys(g, 'garment', ['type', 'name', 'waistFinish', 'finishedLengthMm', 'fullnessRatio', 'hipEaseMm', 'waistbandFinishedHeightMm', 'elasticWidthMm', 'elasticReductionMm', 'ruffle']);
  onlyKeys(r, 'garment.ruffle', ['enabled', 'finishedHeightMm', 'fullnessRatio']);
  onlyKeys(m, 'measurements', ['waistCircumferenceMm', 'hipCircumferenceMm']);
  onlyKeys(c, 'construction', ['seamAllowanceMm', 'hemAllowanceMm', 'elasticOverlapMm']);
  onlyKeys(p, 'print', ['paper', 'marginMm', 'overlapMm']);
  if (g.type !== 'gatheredSkirt') throw new Error('garment.type must be gatheredSkirt');
  if (g.waistFinish !== 'elasticCasing') throw new Error('garment.waistFinish must be elasticCasing');
  if (typeof r.enabled !== 'boolean') throw new Error('garment.ruffle.enabled must be boolean');
  if (p.paper !== 'A4' && p.paper !== 'Letter') throw new Error('print.paper must be A4 or Letter');
  const input: PatternInput = {
    schemaVersion: 1,
    garment: {
      type: 'gatheredSkirt', name: string(g.name, 'garment.name'), waistFinish: 'elasticCasing',
      finishedLengthMm: number(g.finishedLengthMm, 'garment.finishedLengthMm', 250, 1500),
      fullnessRatio: number(g.fullnessRatio, 'garment.fullnessRatio', 1, 4),
      hipEaseMm: number(g.hipEaseMm, 'garment.hipEaseMm', 0, 300),
      waistbandFinishedHeightMm: number(g.waistbandFinishedHeightMm, 'garment.waistbandFinishedHeightMm', 20, 80),
      elasticWidthMm: number(g.elasticWidthMm, 'garment.elasticWidthMm', 5, 60),
      elasticReductionMm: number(g.elasticReductionMm, 'garment.elasticReductionMm', 0, 150),
      ruffle: {
        enabled: r.enabled,
        finishedHeightMm: number(r.finishedHeightMm, 'garment.ruffle.finishedHeightMm', 30, 500),
        fullnessRatio: number(r.fullnessRatio, 'garment.ruffle.fullnessRatio', 1, 3),
      },
    },
    measurements: {
      waistCircumferenceMm: number(m.waistCircumferenceMm, 'measurements.waistCircumferenceMm', 400, 2000),
      hipCircumferenceMm: number(m.hipCircumferenceMm, 'measurements.hipCircumferenceMm', 400, 2500),
    },
    construction: {
      seamAllowanceMm: number(c.seamAllowanceMm, 'construction.seamAllowanceMm', 5, 30),
      hemAllowanceMm: number(c.hemAllowanceMm, 'construction.hemAllowanceMm', 10, 80),
      elasticOverlapMm: number(c.elasticOverlapMm, 'construction.elasticOverlapMm', 10, 50),
    },
    print: {
      paper: p.paper,
      marginMm: number(p.marginMm, 'print.marginMm', 5, 25),
      overlapMm: number(p.overlapMm, 'print.overlapMm', 0, 30),
    },
  };
  const { garment, construction, measurements, print } = input;
  if (measurements.hipCircumferenceMm < measurements.waistCircumferenceMm * 0.7)
    throw new Error('hip measurement seems too small relative to waist');
  if (garment.elasticWidthMm + 5 > garment.waistbandFinishedHeightMm)
    throw new Error('waistband height must exceed elastic width by at least 5 mm');
  if (garment.elasticReductionMm >= measurements.waistCircumferenceMm * 0.2)
    throw new Error('elastic reduction exceeds 20% of waist');
  if (garment.finishedLengthMm - garment.waistbandFinishedHeightMm - (garment.ruffle.enabled ? garment.ruffle.finishedHeightMm : 0) < 80)
    throw new Error('shell visible height must be at least 80 mm');
  const [paperW, paperH] = print.paper === 'A4' ? [210, 297] : [215.9, 279.4];
  if (print.marginMm * 2 + print.overlapMm >= Math.min(paperW, paperH))
    throw new Error('print area is too small');
  if (construction.hemAllowanceMm < construction.seamAllowanceMm)
    throw new Error('hem allowance must be at least seam allowance');
  return input;
}
