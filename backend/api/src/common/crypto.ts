import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** Prisma `Bytes` columns want Uint8Array<ArrayBuffer>; Node Buffers are typed ArrayBufferLike. */
export function bytes(b: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(b);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(input: string | Buffer): Buffer {
  return createHash('sha256').update(input).digest();
}

export function hmacSha256(secret: string | Buffer, ...parts: (string | Buffer)[]): Buffer {
  const h = createHmac('sha256', secret);
  for (const p of parts) h.update(p);
  return h.digest();
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Uniform 6-digit code from a CSPRNG (no modulo bias). */
export function randomDigits(length = 6): string {
  let out = '';
  while (out.length < length) {
    const b = randomBytes(1)[0] as number;
    if (b < 250) out += String(b % 10);
  }
  return out;
}

/** Decode a 32-byte key given as hex (64 chars) or base64. */
export function decodeKey(value: string): Buffer {
  const hex = /^[0-9a-fA-F]{64}$/.test(value);
  const key = hex ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('MFA_ENCRYPTION_KEY must decode to exactly 32 bytes');
  return key;
}

/** AES-256-GCM. Layout: iv(12) | tag(16) | ciphertext. */
export function encryptAesGcm(key: Buffer, plaintext: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decryptAesGcm(key: Buffer, blob: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const data = blob.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/** Canonical JSON hash used for idempotency request hashing (key order independent). */
export function canonicalHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}
