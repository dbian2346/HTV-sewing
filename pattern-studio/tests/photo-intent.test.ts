import { describe, it, expect } from 'vitest';
import { samplePhotoAnalysis, garmentIntentSchema, matchDemoIntent, buildDemoPhotoSpec } from '../src/photo-intent.js';

const reference = { filename: 'reference.png', mimeType: 'image/png' };
const settings = () => ({ measurements: { waist: 720, hip: 980 }, garment: {
  type: 'gathered_skirt', length: 600, ruffle: { enabled: true, height: 120, fullnessRatio: 1.5 },
} });

describe('offline photo-to-pattern contracts (no pattern drafting)', () => {
  it('keeps the initial intent independent of a catalog ID and leaves measurements empty', () => {
    const intent = samplePhotoAnalysis(reference, 'My reference');
    expect(intent.analysisSource).toBe('demo');
    expect(intent.measurements).toEqual({});
    expect(intent.preferences.finishedLengthMm).toBeNull();
    expect(intent.preferences.notes).toBe('My reference');
    expect(garmentIntentSchema.safeParse({ ...intent, designId: 'penelope' }).success).toBe(false);
  });
  it('labels identical observations as a fixed demo regardless of the reference filename', () => {
    expect(samplePhotoAnalysis(reference).observations).toEqual(
      samplePhotoAnalysis({ filename: 'another-photo.jpg', mimeType: 'image/jpeg' }).observations);
  });
  it('selects the supported sample design internally without user pattern selection', () => {
    expect(matchDemoIntent(samplePhotoAnalysis(reference)).designId).toBe('gathered_skirt');
  });
  it('rejects other silhouettes instead of forcing a demo match', () => {
    const intent = samplePhotoAnalysis(reference); intent.observations.category = 'coat';
    expect(() => matchDemoIntent(intent)).toThrow('only demonstrates');
  });
  it('does not substitute example body measurements when actual measurements are missing', () => {
    const intent = samplePhotoAnalysis(reference); intent.preferences.finishedLengthMm = 650;
    expect(() => buildDemoPhotoSpec(intent, settings())).toThrow('waist and hip');
  });
  it('preserves supplied measurements and length when resolving the engine specification', () => {
    const intent = samplePhotoAnalysis(reference);
    intent.measurements = { waist: 810, hip: 1080 }; intent.preferences.finishedLengthMm = 650;
    const result = buildDemoPhotoSpec(intent, settings());
    expect(result.spec.measurements).toEqual({ waist: 810, hip: 1080 });
    expect(result.spec.garment.length).toBe(650);
    expect(result.spec.garment.ruffle.enabled).toBe(true);
    expect(result.match.designId).toBe(result.spec.garment.type);
  });
});
