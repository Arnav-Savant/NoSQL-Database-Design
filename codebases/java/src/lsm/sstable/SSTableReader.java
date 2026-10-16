package lsm.sstable;

import java.nio.ByteBuffer;
import java.util.List;
import java.util.Optional;
import java.util.OptionalInt;
import lsm.entry.Entry;
import lsm.entry.EntryCodec;
import lsm.entry.KeyOrder;
import lsm.io.FileNames;
import lsm.io.StorageDirectory;
import lsm.logging.Logger;

/** Reads one SSTable: the index and Bloom filter stay in memory, data blocks are read on demand. */
public final class SSTableReader {
    private final StorageDirectory directory;
    private final Logger logger;
    private final long indexOffset;
    private final String name;
    private final TableRange range;
    private final int entryCount;
    private final SparseIndex sparseIndex;
    private final BloomFilter bloom;

    private SSTableReader(StorageDirectory directory, Logger logger, String name, TableRange range, int entryCount,
            long indexOffset, SparseIndex sparseIndex, BloomFilter bloom) {
        this.directory = directory;
        this.logger = logger;
        this.indexOffset = indexOffset;
        this.name = name;
        this.range = range;
        this.entryCount = entryCount;
        this.sparseIndex = sparseIndex;
        this.bloom = bloom;
    }

    public static SSTableReader open(StorageDirectory directory, String name, BloomHasher hasher, Logger logger) {
        TableRange range = FileNames.parseTableFileName(name)
                .orElseThrow(() -> new IllegalArgumentException("\"" + name + "\" is not an SSTable file name."));
        long fileSize = directory.sizeOf(name);
        ByteBuffer footer = ByteBuffer.wrap(directory.readRange(name, fileSize - TableFormat.FOOTER_BYTES, TableFormat.FOOTER_BYTES));
        if (footer.getInt(12) != TableFormat.TABLE_MAGIC) throw new IllegalStateException(name + " has no valid SSTable footer.");

        long indexOffset = Integer.toUnsignedLong(footer.getInt(0));
        long bloomOffset = Integer.toUnsignedLong(footer.getInt(4));
        int entryCount = footer.getInt(8);
        SparseIndex sparseIndex = SparseIndex.fromBytes(directory.readRange(name, indexOffset, (int) (bloomOffset - indexOffset)));
        BloomFilter bloom = BloomFilter.fromBytes(
                directory.readRange(name, bloomOffset, (int) (fileSize - TableFormat.FOOTER_BYTES - bloomOffset)), hasher);
        return new SSTableReader(directory, logger, name, range, entryCount, indexOffset, sparseIndex, bloom);
    }

    public String name() {
        return name;
    }

    public TableRange range() {
        return range;
    }

    public int entryCount() {
        return entryCount;
    }

    public SparseIndex sparseIndex() {
        return sparseIndex;
    }

    public BloomFilter bloom() {
        return bloom;
    }

    public boolean mightContain(String key) {
        return bloom.mightContain(key);
    }

    // Reads at most one block from disk; returns the entry (possibly a tombstone) or empty.
    public Optional<Entry> find(String key) {
        OptionalInt located = sparseIndex.locate(key);
        if (located.isEmpty()) {
            logger.debug("SSTable", "key sorts before the first block, no read needed", "table", name, "key", key);
            return Optional.empty();
        }
        int index = located.getAsInt();
        BlockHandle block = sparseIndex.blocks().get(index);
        List<Entry> entries = EntryCodec.decodeAll(directory.readRange(name, block.offset(), block.length()));
        logger.debug("SSTable", "block read", "table", name, "block", index + 1, "firstKey", block.firstKey(), "bytes", block.length());

        int low = 0;
        int high = entries.size() - 1;
        while (low <= high) {
            int middle = (low + high) >>> 1;
            int order = KeyOrder.compareKeys(entries.get(middle).key(), key);
            if (order == 0) return Optional.of(entries.get(middle));
            if (order < 0) low = middle + 1;
            else high = middle - 1;
        }
        return Optional.empty();
    }

    public List<Entry> readAllEntries() {
        return EntryCodec.decodeAll(directory.readRange(name, 0, (int) indexOffset));
    }
}
