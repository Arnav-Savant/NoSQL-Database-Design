const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const SECOND_HASH_SEED = 0x5bd1e995;

function fnv1a32(bytes, seed) {
  let hash = seed >>> 0;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash;
}

/** Derives k bit positions from two FNV-1a hashes of the key (double hashing). */
export class BloomHasher {
  positions(key, bitCount, hashCount) {
    const keyBytes = Buffer.from(key, 'utf8');
    const first = fnv1a32(keyBytes, FNV_OFFSET_BASIS);
    // An odd step keeps the k probes from collapsing onto the same bit.
    const second = (fnv1a32(keyBytes, (FNV_OFFSET_BASIS ^ SECOND_HASH_SEED) >>> 0) | 1) >>> 0;
    const positions = [];
    for (let i = 0; i < hashCount; i++) positions.push((first + i * second) % bitCount);
    return positions;
  }
}
