package lsm.sstable;

import java.nio.ByteBuffer;
import java.util.Arrays;

/** Probabilistic set membership; layout: u32 bitCount | u8 hashCount | ceil(bitCount / 8) bytes (bit p in byte p >> 3, mask 1 << (p & 7)). */
public final class BloomFilter {
    private static final int MIN_BITS = 64;
    private static final int MAX_HASHES = 8;
    private static final int HEADER_BYTES = 4 + 1;

    // "Definitely absent" is always right, "maybe present" can be wrong.
    private final int bitCount;
    private final int hashCount;
    private final byte[] bits;
    private final BloomHasher hasher;

    public BloomFilter(int bitCount, int hashCount, byte[] bits, BloomHasher hasher) {
        this.bitCount = bitCount;
        this.hashCount = hashCount;
        this.bits = bits;
        this.hasher = hasher;
    }

    // NOTE: the size is fixed once built, but the false-positive rate rises as keys are added, so
    // each table sizes its filter from its own key count instead of using one global size.
    public static BloomFilter forEntryCount(int entryCount, int bitsPerKey, BloomHasher hasher) {
        long wanted = (long) Math.ceil((double) entryCount * bitsPerKey);
        int bitCount = (int) Math.max(MIN_BITS, (long) Math.ceil(wanted / 8.0) * 8);
        int hashCount = (int) Math.min(MAX_HASHES, Math.max(1, Math.round(bitsPerKey * Math.log(2))));
        return new BloomFilter(bitCount, hashCount, new byte[bitCount / 8], hasher);
    }

    public static BloomFilter fromBytes(byte[] bytes, BloomHasher hasher) {
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        int bitCount = buffer.getInt(0);
        int hashCount = Byte.toUnsignedInt(buffer.get(4));
        byte[] bits = Arrays.copyOfRange(bytes, HEADER_BYTES, HEADER_BYTES + bitCount / 8);
        return new BloomFilter(bitCount, hashCount, bits, hasher);
    }

    public int bitCount() {
        return bitCount;
    }

    public int hashCount() {
        return hashCount;
    }

    public void add(String key) {
        for (int position : positionsOf(key)) bits[position >> 3] |= (byte) (1 << (position & 7));
    }

    public boolean mightContain(String key) {
        for (int position : positionsOf(key)) {
            if ((bits[position >> 3] & (1 << (position & 7))) == 0) return false;
        }
        return true;
    }

    public int[] positionsOf(String key) {
        return hasher.positions(key, bitCount, hashCount);
    }

    public int setBitCount() {
        int count = 0;
        for (int position = 0; position < bitCount; position++) {
            if ((bits[position >> 3] & (1 << (position & 7))) != 0) count++;
        }
        return count;
    }

    public byte[] toBytes() {
        return ByteBuffer.allocate(HEADER_BYTES + bits.length)
                .putInt(bitCount)
                .put((byte) hashCount)
                .put(bits)
                .array();
    }
}
