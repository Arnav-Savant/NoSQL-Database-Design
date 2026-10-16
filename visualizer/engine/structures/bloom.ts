import type { BloomView } from '../model';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const SECOND_HASH_SEED = 0x5bd1e995;
const MIN_BITS = 64;
const MAX_HASHES = 8;
const encoder = new TextEncoder();

function fnv1a32(bytes: Uint8Array, seed: number): number {
  let hash = seed >>> 0;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash;
}

/** Bit-for-bit the same Bloom filter as the engines, so positions here match the real files. */
export class BloomModel {
  readonly bits: (0 | 1)[];

  constructor(
    readonly bitCount: number,
    readonly hashCount: number,
  ) {
    this.bits = Array.from({ length: bitCount }, () => 0 as const);
  }

  static forEntryCount(entryCount: number, bitsPerKey: number): BloomModel {
    const wanted = Math.ceil(entryCount * bitsPerKey);
    const bitCount = Math.max(MIN_BITS, Math.ceil(wanted / 8) * 8);
    const hashCount = Math.min(MAX_HASHES, Math.max(1, Math.round(bitsPerKey * Math.LN2)));
    return new BloomModel(bitCount, hashCount);
  }

  positions(key: string): number[] {
    const bytes = encoder.encode(key);
    const first = fnv1a32(bytes, FNV_OFFSET_BASIS);
    const second = (fnv1a32(bytes, (FNV_OFFSET_BASIS ^ SECOND_HASH_SEED) >>> 0) | 1) >>> 0;
    return Array.from({ length: this.hashCount }, (_, i) => (first + i * second) % this.bitCount);
  }

  add(key: string): number[] {
    const positions = this.positions(key);
    for (const position of positions) this.bits[position] = 1;
    return positions;
  }

  mightContain(key: string): boolean {
    return this.positions(key).every((position) => this.bits[position] === 1);
  }

  view(): BloomView {
    return { bits: [...this.bits], hashCount: this.hashCount };
  }
}
