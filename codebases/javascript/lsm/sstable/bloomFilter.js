const MIN_BITS = 64;
const MAX_HASHES = 8;
const HEADER_BYTES = 4 + 1;

/**
 * Probabilistic set membership: "definitely absent" is always right, "maybe present" can be wrong.
 *
 * Layout: u32 bitCount | u8 hashCount | ceil(bitCount / 8) bytes (bit p lives in byte p >> 3, mask 1 << (p & 7))
 */
export class BloomFilter {
  #bits;
  #hasher;

  constructor(bitCount, hashCount, bits, hasher) {
    this.bitCount = bitCount;
    this.hashCount = hashCount;
    this.#bits = bits;
    this.#hasher = hasher;
  }

  // NOTE: the size is fixed once built, but the false-positive rate rises as keys are added, so
  // each table sizes its filter from its own key count instead of using one global size.
  static forEntryCount(entryCount, bitsPerKey, hasher) {
    const wanted = Math.ceil(entryCount * bitsPerKey);
    const bitCount = Math.max(MIN_BITS, Math.ceil(wanted / 8) * 8);
    const hashCount = Math.min(MAX_HASHES, Math.max(1, Math.round(bitsPerKey * Math.LN2)));
    return new BloomFilter(bitCount, hashCount, Buffer.alloc(bitCount / 8), hasher);
  }

  static fromBytes(bytes, hasher) {
    const bitCount = bytes.readUInt32BE(0);
    const hashCount = bytes.readUInt8(4);
    const bits = Buffer.from(bytes.subarray(HEADER_BYTES, HEADER_BYTES + bitCount / 8));
    return new BloomFilter(bitCount, hashCount, bits, hasher);
  }

  add(key) {
    for (const position of this.positionsOf(key)) this.#bits[position >> 3] |= 1 << (position & 7);
  }

  mightContain(key) {
    return this.positionsOf(key).every((position) => (this.#bits[position >> 3] & (1 << (position & 7))) !== 0);
  }

  positionsOf(key) {
    return this.#hasher.positions(key, this.bitCount, this.hashCount);
  }

  setBitCount() {
    let count = 0;
    for (let position = 0; position < this.bitCount; position++) {
      if (this.#bits[position >> 3] & (1 << (position & 7))) count++;
    }
    return count;
  }

  toBytes() {
    const header = Buffer.alloc(HEADER_BYTES);
    header.writeUInt32BE(this.bitCount, 0);
    header.writeUInt8(this.hashCount, 4);
    return Buffer.concat([header, this.#bits]);
  }
}
