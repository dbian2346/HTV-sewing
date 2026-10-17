import { z } from 'zod';

const mm = (max = 5000) => z.number().finite().positive().max(max);
const allowance = z.number().finite().min(0).max(100);
export const inputSchema = z.strictObject({
  measurements: z.strictObject({ waist: mm().min(200), hip: mm().min(200) }),
  garment: z.strictObject({
    type: z.literal('gathered_skirt'),
    length: mm(2000),
    fullnessRatio: z.number().finite().min(1).max(5).default(2),
    waistband: z.strictObject({
      finishedHeight: mm(150).min(20).default(30),
      elasticWidth: mm(140).default(25),
      elasticLengthRatio: z.number().finite().min(0.5).max(1).default(0.9),
      elasticOverlap: mm(50).default(20),
      elasticStretchRatio: z.number().finite().min(1).max(4).default(2),
      hipEase: z.number().finite().min(0).max(200).default(40),
    }).default({ finishedHeight: 30, elasticWidth: 25, elasticLengthRatio: 0.9,
      elasticOverlap: 20, elasticStretchRatio: 2, hipEase: 40 }),
    ruffle: z.strictObject({
      enabled: z.boolean().default(false),
      height: mm(1000).min(40).default(120),
      fullnessRatio: z.number().finite().min(1).max(4).default(1.5),
    }).default({ enabled: false, height: 120, fullnessRatio: 1.5 }),
  }),
  construction: z.strictObject({
    seamAllowance: allowance.default(10),
    hemAllowance: allowance.default(25),
  }).default({ seamAllowance: 10, hemAllowance: 25 }),
});

export type PatternInput = z.input<typeof inputSchema>;
export type PatternSpec = z.output<typeof inputSchema>;

/** Cross-field checks cannot be expressed by the generated structural JSON Schema. */
export const specSchema = inputSchema.superRefine((s, ctx) => {
  const { waistband: b, ruffle: r } = s.garment;
  const opening = Math.max(s.measurements.hip, s.measurements.waist) + b.hipEase;
  const fail = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  if (s.measurements.waist * s.garment.fullnessRatio < opening)
    fail(['garment', 'fullnessRatio'], 'Skirt circumference must be at least the waistband opening (max(waist, hip) + hipEase).');
  if (s.garment.length - b.finishedHeight - (r.enabled ? r.height : 0) < 40)
    fail(['garment', 'length'], 'Length must leave at least 40 mm of body below waistband and above ruffle.');
  if (b.finishedHeight < b.elasticWidth + 3)
    fail(['garment', 'waistband', 'finishedHeight'], 'Casing must exceed elastic width by at least 3 mm.');
  if (s.measurements.waist * b.elasticLengthRatio * b.elasticStretchRatio < opening)
    fail(['garment', 'waistband', 'elasticStretchRatio'], 'Joined elastic must stretch enough to pass the waistband opening.');
});
