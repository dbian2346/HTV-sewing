import { z } from 'zod';
export const measurementProfileSchema = z.object({ source:z.enum(['manual','photo_estimate']),
  height_mm:z.number().finite().positive().optional(),measurements:z.record(z.string(),z.number().finite().positive().max(5000)),
  confidence:z.record(z.string(),z.enum(['low','medium','high'])).optional() });
export type MeasurementProfile = z.infer<typeof measurementProfileSchema>;
/** The gathered skirt's hip is the fullest seat circumference, not the high hip. */
export function profileValue(profile: MeasurementProfile | null, key: string, design: string): number | undefined {
  return profile?.measurements[design === 'gathered_skirt' && key === 'hip' ? 'seat' : key];
}
