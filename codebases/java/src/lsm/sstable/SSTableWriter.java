package lsm.sstable;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import lsm.config.StoreConfig;
import lsm.entry.Entry;
import lsm.entry.EntryCodec;
import lsm.io.FileNames;
import lsm.io.StorageDirectory;
import lsm.logging.Logger;

/** Writes sorted entries as an immutable SSTable file. */
public final class SSTableWriter {
    private final StorageDirectory directory;
    private final StoreConfig config;
    private final BloomHasher hasher;
    private final Logger logger;

    public SSTableWriter(StorageDirectory directory, StoreConfig config, BloomHasher hasher, Logger logger) {
        this.directory = directory;
        this.config = config;
        this.hasher = hasher;
        this.logger = logger;
    }

    // Entries must already be sorted by key with one entry per key. Returns the file name.
    public String write(TableRange range, List<Entry> entries) {
        BloomFilter bloom = BloomFilter.forEntryCount(entries.size(), config.bloomBitsPerKey(), hasher);
        ByteArrayOutputStream data = new ByteArrayOutputStream();
        List<BlockHandle> blocks = packBlocks(entries, bloom, data);
        byte[] dataBytes = data.toByteArray();
        byte[] indexBytes = new SparseIndex(blocks).toBytes();
        byte[] bloomBytes = bloom.toBytes();

        // NOTE: offsets are 32-bit, which limits one table to 4 GiB. Real engines use 64-bit offsets.
        byte[] footer = ByteBuffer.allocate(TableFormat.FOOTER_BYTES)
                .putInt(dataBytes.length)
                .putInt(dataBytes.length + indexBytes.length)
                .putInt(entries.size())
                .putInt(TableFormat.TABLE_MAGIC)
                .array();

        String name = FileNames.tableFileName(range);
        ByteArrayOutputStream file = new ByteArrayOutputStream();
        file.writeBytes(dataBytes);
        file.writeBytes(indexBytes);
        file.writeBytes(bloomBytes);
        file.writeBytes(footer);
        byte[] fileBytes = file.toByteArray();
        directory.writeAtomically(name, fileBytes);
        logger.info("SSTable", "written",
                "table", name,
                "entries", entries.size(),
                "blocks", blocks.size(),
                "bloomBits", bloom.setBitCount() + "/" + bloom.bitCount(),
                "bytes", fileBytes.length);
        return name;
    }

    private List<BlockHandle> packBlocks(List<Entry> entries, BloomFilter bloom, ByteArrayOutputStream data) {
        List<BlockHandle> blocks = new ArrayList<>();
        long offset = 0;
        String currentFirstKey = null;
        long currentOffset = 0;
        int currentLength = 0;

        for (Entry entry : entries) {
            byte[] encoded = EntryCodec.encode(entry);
            boolean blockIsFull = currentFirstKey != null && currentLength + encoded.length > config.blockSizeBytes();
            if (currentFirstKey == null || blockIsFull) {
                if (currentFirstKey != null) blocks.add(new BlockHandle(currentFirstKey, currentOffset, currentLength));
                currentFirstKey = entry.key();
                currentOffset = offset;
                currentLength = 0;
            }
            data.writeBytes(encoded);
            currentLength += encoded.length;
            offset += encoded.length;
            bloom.add(entry.key());
        }
        if (currentFirstKey != null) blocks.add(new BlockHandle(currentFirstKey, currentOffset, currentLength));
        return blocks;
    }
}
