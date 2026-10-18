import { describe, expect, it } from 'vitest';
import { createSessionToken, readSessionToken } from '../server/session-token.mjs';

const secret = 'test-secret-that-is-at-least-thirty-two-characters';
const design = { designId: 'gathered_skirt', name: 'Gathered skirt' };
const designs = new Map([[design.designId, design]]);
const session = {
  expires: 2_000,
  design,
  intent: { schemaVersion: 1, observations: { category: 'skirt' } },
  match: { status: 'matched', designId: design.designId },
};

describe('signed photo-analysis sessions', () => {
  it('round-trips without server memory', () => {
    const result = readSessionToken(createSessionToken(session, secret), designs, secret, 1_000);
    expect(result.design).toBe(design);
    expect(result.intent).toEqual(session.intent);
    expect(result.match).toEqual(session.match);
  });

  it('rejects tampering', () => {
    const token = createSessionToken(session, secret);
    expect(() => readSessionToken(`x${token.slice(1)}`, designs, secret, 1_000)).toThrow('invalid');
  });

  it('rejects expired sessions', () => {
    const token = createSessionToken(session, secret);
    expect(() => readSessionToken(token, designs, secret, 2_001)).toThrow('expired');
  });
});
