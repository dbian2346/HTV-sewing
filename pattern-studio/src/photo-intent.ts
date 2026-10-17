import { z } from 'zod';
import { specSchema } from './schema.js';

/** Photo observations describe the requested garment before any design is selected. */
export const garmentIntentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  analysisSource: z.enum(['demo', 'gemini']),
  reference: z.strictObject({ filename: z.string(), mimeType: z.string() }),
  observations: z.strictObject({
    category: z.string(), silhouette: z.string(),
    neckline: z.string().nullable(), sleeves: z.string().nullable(),
    waistTreatment: z.string().nullable(), apparentLength: z.string().nullable(),
    hemDetails: z.array(z.string()), closures: z.array(z.string()),
    visibleFeatures: z.array(z.string()), unknownFeatures: z.array(z.string()),
  }),
  measurements: z.record(z.string(), z.number().finite().positive().max(5000)),
  preferences: z.strictObject({
    finishedLengthMm: z.number().finite().positive().max(2000).nullable(),
    notes: z.string().max(2000),
  }),
});
export type GarmentIntent = z.infer<typeof garmentIntentSchema>;

/** Deliberate fixture: does not inspect image pixels or infer anything about the upload. */
export function samplePhotoAnalysis(reference: GarmentIntent['reference'], notes = ''): GarmentIntent {
  return garmentIntentSchema.parse({
    schemaVersion: 1, analysisSource: 'demo', reference,
    observations: {
      category: 'skirt', silhouette: 'gathered', neckline: null, sleeves: null,
      waistTreatment: 'elastic', apparentLength: 'knee-length',
      hemDetails: ['gathered ruffle'], closures: [],
      visibleFeatures: ['Full gathered skirt', 'Elastic waist', 'Gathered ruffle at the hem'],
      unknownFeatures: ['Actual finished length', 'Fabric structure and stretch', 'Hidden construction details'],
    },
    measurements: {}, preferences: { finishedLengthMm: null, notes },
  });
}

/** Replace with a catalog-aware AI matcher when the API is added. No design input from the user. */
export function matchDemoIntent(input: unknown) {
  const intent = garmentIntentSchema.parse(input), o = intent.observations;
  if (o.category !== 'skirt' || o.silhouette !== 'gathered' || o.waistTreatment !== 'elastic')
    throw new Error('The offline prototype only demonstrates the sample gathered-skirt analysis. Other photo matching needs the future AI integration.');
  return {
    designId: 'gathered_skirt', name: 'Gathered skirt', source: 'demo' as const,
    explanation: 'The sample describes gathered fullness and an elastic waist, which match the gathered-skirt template. Its hem ruffle is a supported variation.',
    differences: ['Fabric, exact proportions and hidden construction have not been matched to the uploaded photo.'],
  };
}

/** Resolve neutral intent into the existing, validated engine contract. Never invent measurements. */
export function buildDemoPhotoSpec(input: unknown, draftSettings: unknown) {
  const intent = garmentIntentSchema.parse(input), match = matchDemoIntent(intent);
  const settings = specSchema.parse(draftSettings);
  if (intent.preferences.finishedLengthMm === null) throw new Error('Enter your desired finished skirt length.');
  if (intent.measurements.waist === undefined || intent.measurements.hip === undefined)
    throw new Error('Enter your waist and hip measurements.');
  const spec = specSchema.parse({
    ...settings,
    measurements: { waist: intent.measurements.waist, hip: intent.measurements.hip },
    garment: { ...settings.garment, type: match.designId, length: intent.preferences.finishedLengthMm },
  });
  return { intent, match, spec };
}
