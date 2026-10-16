package lsm.sstable;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalInt;
import lsm.entry.KeyOrder;

/** One entry per data block; layout: u32 blockCount | per block: u16 keyLength | first key | u32 offset | u32 length. */
public final class SparseIndex {
    private final List<BlockHandle> blocks;

    public SparseIndex(List<BlockHandle> blocks) {
        this.blocks = List.copyOf(blocks);
    }

    public static SparseIndex fromBytes(byte[] bytes) {
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        int blockCount = buffer.getInt();
        List<BlockHandle> blocks = new ArrayList<>();
        for (int i = 0; i < blockCount; i++) {
            byte[] keyBytes = new byte[Short.toUnsignedInt(buffer.getShort())];
            buffer.get(keyBytes);
            long blockOffset = Integer.toUnsignedLong(buffer.getInt());
            int length = buffer.getInt();
            blocks.add(new BlockHandle(new String(keyBytes, UTF_8), blockOffset, length));
        }
        return new SparseIndex(blocks);
    }

    public List<BlockHandle> blocks() {
        return blocks;
    }

    // The only block that can hold `key`: the last one whose first key is <= key. Returns its index.
    public OptionalInt locate(String key) {
        int low = 0;
        int high = blocks.size() - 1;
        int found = -1;
        while (low <= high) {
            int middle = (low + high) >>> 1;
            if (KeyOrder.compareKeys(blocks.get(middle).firstKey(), key) <= 0) {
                found = middle;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }
        return found == -1 ? OptionalInt.empty() : OptionalInt.of(found);
    }

    public byte[] toBytes() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(ByteBuffer.allocate(4).putInt(blocks.size()).array());
        for (BlockHandle block : blocks) {
            byte[] keyBytes = block.firstKey().getBytes(UTF_8);
            out.writeBytes(ByteBuffer.allocate(2).putShort((short) keyBytes.length).array());
            out.writeBytes(keyBytes);
            out.writeBytes(ByteBuffer.allocate(8).putInt((int) block.offset()).putInt(block.length()).array());
        }
        return out.toByteArray();
    }
}
