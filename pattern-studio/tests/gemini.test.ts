import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { geminiJSON } from '../server/gemini.mjs';
import { validateOptionValues, resolveSession } from '../server/photo-api.mjs';
import { samplePhotoAnalysis } from '../src/photo-intent.js';
const schema = z.strictObject({ summary: z.string() });
const result = (text: string, finishReason = 'STOP') => new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text }] } }] }), { status: 200 });
describe('Gemini transport and resolver (mock API; no garment drafting)', () => {
  it('sends the key only in the server header and includes image data with structured output', async () => {
    let called = false;
    const data = await geminiJSON(schema, 'Describe this', { mimeType: 'image/png', data: 'image-bytes' }, { apiKey: 'test-token', fetchImpl: async (url: string, options: any) => {
      called = true; expect(url).not.toContain('test-token');
      expect(options.headers['x-goog-api-key']).toBe('test-token');
      const body = JSON.parse(options.body);
      expect(body.contents[0].parts[1].inlineData.mimeType).toBe('image/png');
      expect(body.generationConfig.responseMimeType).toBe('application/json');
      expect(body.generationConfig.responseJsonSchema.$schema).toBeUndefined();
      return result('{"summary":"skirt"}');
    } });
    expect(called).toBe(true); expect(data.summary).toBe('skirt');
  });
  it('reports quota failures without forwarding potentially sensitive provider error text', async () => {
    await expect(geminiJSON(schema, 'test', null, { apiKey: 'test-token', fetchImpl: async () => new Response('{"error":{"message":"test-token"}}', { status: 429 }) })).rejects.toThrow('quota');
  });
  it('rejects truncated provider output', async () => {
    await expect(geminiJSON(schema, 'test', null, { apiKey: 'test-token', fetchImpl: async () => result('{}', 'MAX_TOKENS') })).rejects.toThrow('did not complete');
  });
  it('validates model JSON instead of trusting arbitrary fields', async () => {
    await expect(geminiJSON(schema, 'test', null, { apiKey: 'test-token', fetchImpl: async () => result('{"invented":"skirt"}') })).rejects.toThrow('invalid structured');
  });
  it('rejects hallucinated catalog options and incorrect primitive types', () => {
    expect(() => validateOptionValues('penelope', [{ key: 'puffSleeves', value: true }])).toThrow('unsupported option');
    expect(() => validateOptionValues('penelope', [{ key: 'backVent', value: 'yes' }])).toThrow('invalid value');
    expect(validateOptionValues('penelope', [{ key: 'backVent', value: false }])).toEqual({ backVent: false });
  });
  it('rejects duplicate model options', () => {
    expect(() => validateOptionValues('penelope', [{ key: 'backVent', value: true }, { key: 'backVent', value: false }])).toThrow('repeated');
  });
  const session = () => ({ intent: { ...samplePhotoAnalysis({ filename: 'synthetic.png', mimeType: 'image/png' }), analysisSource: 'gemini' }, design: { designId: 'gathered_skirt', name: 'Gathered skirt' }, match: { designId: 'gathered_skirt' } });
  it('preserves real supplied measurements and Gemini provenance in resolved JSON', () => {
    const data = resolveSession(session(), { measurements: { waist: 810, hip: 1080 }, garment: { type: 'gathered_skirt', length: 650 } });
    expect(data.spec.measurements).toEqual({ waist: 810, hip: 1080 });
    expect(data.intent.measurements).toEqual(data.spec.measurements);
    expect(data.intent.analysisSource).toBe('gemini');
  });
  it('does not permit replacing the automatic match or inventing missing measurements', () => {
    expect(() => resolveSession(session(), { garment: { designId: 'penelope' } })).toThrow('automatically matched');
    expect(() => resolveSession(session(), { measurements: {}, garment: { type: 'gathered_skirt', length: 650 } })).toThrow();
  });
});
