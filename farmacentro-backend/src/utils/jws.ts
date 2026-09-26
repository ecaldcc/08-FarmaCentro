import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies an HS256 JWS (as sent by Netlify in `x-nf-sign`) and returns its claims, or null when
 * the format, algorithm or signature is wrong. Claim checks (iss, exp, …) are left to the caller.
 */
export function verifyHs256(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64 = '', payloadB64 = '', signatureB64 = ''] = parts;
  try {
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as { alg?: string };
    if (header.alg !== 'HS256') return null;
    const expected = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest();
    const received = Buffer.from(signatureB64, 'base64url');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as unknown;
    return claims && typeof claims === 'object' ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
