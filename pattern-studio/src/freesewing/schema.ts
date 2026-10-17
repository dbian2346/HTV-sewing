import { z } from 'zod';

const circumference = z.number().finite().min(200).max(2500);
const height = z.number().finite().min(50).max(1500);
export const penelopeOptionsSchema = z.strictObject({
  curvedDarts: z.boolean().default(true), backVent: z.boolean().default(true),
  nrOfDarts: z.number().int().min(1).max(2).default(2), waistband: z.boolean().default(true),
  lengthBonusPct: z.number().finite().min(-50).max(50).default(0),
  hemBonusPct: z.number().finite().min(-35).max(0).default(0),
  waistEasePct: z.number().finite().min(0).max(8).default(1),
  seatEasePct: z.number().finite().min(0).max(8).default(1),
});
export const penelopeInputSchema = z.strictObject({
  schemaVersion: z.literal(2), measurementSystem: z.literal('metric'),
  garment: z.strictObject({ designId: z.literal('penelope'), family: z.literal('skirt'), name: z.string().max(100).default('Penelope pencil skirt') }),
  measurements: z.strictObject({ waist: circumference, seat: circumference, waistToHips: height,
    waistToSeat: height, waistToKnee: height, waistBack: z.number().finite().min(50).max(2500).optional(), seatBack: z.number().finite().min(50).max(2500).optional() }),
  options: penelopeOptionsSchema.default({ curvedDarts: true, backVent: true, nrOfDarts: 2, waistband: true,
    lengthBonusPct: 0, hemBonusPct: 0, waistEasePct: 1, seatEasePct: 1 }),
  construction: z.strictObject({ seamAllowanceMm: z.number().finite().min(0).max(30).default(10) }).default({ seamAllowanceMm: 10 }),
  render: z.strictObject({ complete: z.literal(true).default(true), paperless: z.literal(false).default(false) }).default({ complete: true, paperless: false }),
  print: z.strictObject({ paper: z.enum(['A4', 'Letter']).default('A4'), marginMm: z.number().finite().min(10).max(40).default(12),
    overlapMm: z.number().finite().min(0).max(50).default(10), calibrationSquareMm: z.literal(50).default(50) })
    .default({ paper: 'A4', marginMm: 12, overlapMm: 10, calibrationSquareMm: 50 }),
  fabric: z.strictObject({ structure: z.literal('woven'), stretchPct: z.literal(0),
    shrinkagePct: z.number().finite().min(0).max(100).default(0), directionalPrint: z.boolean().default(false) }).optional(),
});
export const penelopeSchema = penelopeInputSchema.superRefine((s, ctx) => {
  const m = s.measurements;
  const fail = (path: string[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (m.seat < m.waist) fail(['measurements', 'seat'], 'This fitted-skirt adapter supports seat circumference at least as large as waist. Choose another template for this proportion.');
  if (m.waistToHips >= m.waistToSeat) fail(['measurements', 'waistToSeat'], 'Waist-to-seat must exceed waist-to-hips.');
  if (m.waistToSeat >= m.waistToKnee) fail(['measurements', 'waistToKnee'], 'Waist-to-knee must exceed waist-to-seat.');
  if (m.waistToKnee * (1 + s.options.lengthBonusPct / 100) < m.waistToSeat + 60)
    fail(['options', 'lengthBonusPct'], 'The skirt body must extend at least 60 mm below the seat line.');
  for (const [part, whole] of [['waistBack', 'waist'], ['seatBack', 'seat']] as const)
    if (m[part] !== undefined && m[part]! >= m[whole]) fail(['measurements', part], `${part} must be less than the full ${whole} circumference.`);
  if ((m.waistBack === undefined) !== (m.seatBack === undefined))
    fail(['measurements', 'waistBack'], 'Provide both optional back arcs together, or omit both.');
  if (m.waistBack !== undefined && m.seatBack !== undefined &&
      (m.waistBack > m.seatBack || m.waist - m.waistBack > m.seat - m.seatBack))
    fail(['measurements', 'seatBack'], 'For this adapter, both front and back seat arcs must be at least their respective waist arcs.');
});
export type PenelopeSpec = z.output<typeof penelopeSchema>;
export type PenelopeInput = z.input<typeof penelopeSchema>;
export function mapPenelopeSettings(spec: PenelopeSpec) {
  const o = spec.options;
  return { measurements: { ...spec.measurements }, options: {
    curvedDarts: o.curvedDarts, backVent: o.backVent, nrOfDarts: o.nrOfDarts, waistband: o.waistband,
    lengthBonus: o.lengthBonusPct / 100, hemBonus: o.hemBonusPct / 100,
    waistEase: o.waistEasePct / 100, seatEase: o.seatEasePct / 100,
    // This supported variation uses a back zipper and a band that meets edge-to-edge, without overlap.
    waistbandOverlap: 0, zipperLocation: 'backSeam',
  }, sa: spec.construction.seamAllowanceMm, complete: true, paperless: false,
  units: 'metric', scale: 1, expand: true, idPrefix: 'penelope-studio-' };
}
