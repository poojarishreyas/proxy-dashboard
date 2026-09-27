import { createHash, timingSafeEqual } from 'node:crypto';

export function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Constant-time string compare, so checking the shared cloud key can't be timed. */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
