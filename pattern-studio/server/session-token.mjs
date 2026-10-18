import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const localSecret = randomBytes(32).toString('base64url');

function signingSecret() {
  if (process.env.SESSION_SECRET?.length >= 32) return process.env.SESSION_SECRET;
  if (process.env.VERCEL) throw new Error('SESSION_SECRET must be configured for the deployed app.');
  return localSecret;
}

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(session, secret = signingSecret()) {
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    expires: session.expires,
    designId: session.design.designId,
    intent: session.intent,
    match: session.match,
  })).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

export function readSessionToken(token, designsById, secret = signingSecret(), now = Date.now()) {
  if (typeof token !== 'string' || token.length > 20_000) throw new Error('This analysis is invalid. Analyze your photo again.');
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra) throw new Error('This analysis is invalid. Analyze your photo again.');
  const expectedSignature = signature(payload, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('This analysis is invalid. Analyze your photo again.');
  let decoded;
  try { decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { throw new Error('This analysis is invalid. Analyze your photo again.'); }
  const design = designsById.get(decoded.designId);
  if (decoded.version !== 1 || !Number.isFinite(decoded.expires) || decoded.expires < now || !design || !decoded.intent || !decoded.match)
    throw new Error('This analysis expired. Analyze your photo again.');
  return { intent: decoded.intent, match: decoded.match, design, expires: decoded.expires };
}
