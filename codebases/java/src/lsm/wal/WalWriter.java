package lsm.wal;

import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import lsm.entry.Entry;
import lsm.entry.EntryCodec;
import lsm.io.Crc32;
import lsm.io.FileNames;
import lsm.io.StorageDirectory;
import lsm.logging.Logger;

/** Appends entries to one write-ahead log; record layout (big-endian): u32 crc32(payload) | u32 payloadLength | payload. */
public final class WalWriter {
    public static final int WAL_RECORD_HEADER_BYTES = 8;

    private final StorageDirectory directory;
    private final Logger logger;
    private final FileChannel channel;
    private final long sequence;
    private final String name;
    private long sizeBytes;
    private int recordCount;

    public WalWriter(StorageDirectory directory, long sequence, Logger logger) {
        this.directory = directory;
        this.logger = logger;
        this.sequence = sequence;
        this.name = FileNames.walFileName(sequence);
        this.channel = directory.openForAppend(name);
        this.sizeBytes = directory.sizeOf(name);
        this.recordCount = 0;
    }

    public long sequence() {
        return sequence;
    }

    public String name() {
        return name;
    }

    public long sizeBytes() {
        return sizeBytes;
    }

    public int recordCount() {
        return recordCount;
    }

    public void append(Entry entry) {
        byte[] payload = EntryCodec.encode(entry);
        byte[] record = ByteBuffer.allocate(WAL_RECORD_HEADER_BYTES + payload.length)
                .putInt((int) Crc32.checksum(payload))
                .putInt(payload.length)
                .put(payload)
                .array();

        // NOTE: one fsync per write is the safest choice and the slowest. Production systems batch
        // several writes into one fsync (group commit) to trade a little latency for throughput.
        directory.appendAndSync(channel, record);
        sizeBytes += record.length;
        recordCount += 1;
        logger.debug("Wal", "appended", "wal", name, "key", entry.key(), "bytes", record.length, "walBytes", sizeBytes);
    }

    public void close() {
        directory.closeFile(channel);
    }
}
