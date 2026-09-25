/**
 * Normalises binary values read from MongoDB. Lean queries and toObject() return BSON `Binary`
 * instances instead of Node Buffers; Buffer.from() would silently produce the wrong bytes.
 */
export function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value && typeof value === 'object' && 'buffer' in value) {
    const inner = (value as { buffer: unknown }).buffer;
    if (inner instanceof Uint8Array) return Buffer.from(inner);
  }
  throw new TypeError('Unsupported binary value');
}
