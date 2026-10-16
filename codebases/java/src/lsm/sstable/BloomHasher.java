package lsm.sstable;

import static java.nio.charset.StandardCharsets.UTF_8;

/** Derives k bit positions from two FNV-1a hashes of the key (double hashing). */
public final class BloomHasher {
    private static final long FNV_OFFSET_BASIS = 0x811c9dc5L;
    private static final long FNV_PRIME = 0x01000193L;
    private static final long SECOND_HASH_SEED = 0x5bd1e995L;
    private static final long UINT32_MASK = 0xFFFFFFFFL;

    public int[] positions(String key, int bitCount, int hashCount) {
        byte[] keyBytes = key.getBytes(UTF_8);
        long first = fnv1a32(keyBytes, FNV_OFFSET_BASIS);
        // An odd step keeps the k probes from collapsing onto the same bit.
        long second = fnv1a32(keyBytes, FNV_OFFSET_BASIS ^ SECOND_HASH_SEED) | 1;
        int[] positions = new int[hashCount];
        for (int i = 0; i < hashCount; i++) positions[i] = (int) ((first + (long) i * second) % bitCount);
        return positions;
    }

    // Hashes are held as unsigned 32-bit values in a long so every port derives the same positions.
    private static long fnv1a32(byte[] bytes, long seed) {
        long hash = seed & UINT32_MASK;
        for (byte value : bytes) {
            hash ^= Byte.toUnsignedLong(value);
            hash = (hash * FNV_PRIME) & UINT32_MASK;
        }
        return hash;
    }
}
