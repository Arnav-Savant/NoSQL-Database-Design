package lsm.wal;

import lsm.io.StorageDirectory;
import lsm.logging.Logger;

/** Opens the write-ahead log for a given sequence number, creating the file if needed. */
public final class WalWriterFactory {
    private final StorageDirectory directory;
    private final Logger logger;

    public WalWriterFactory(StorageDirectory directory, Logger logger) {
        this.directory = directory;
        this.logger = logger;
    }

    public WalWriter open(long sequence) {
        WalWriter writer = new WalWriter(directory, sequence, logger);
        logger.info("Wal", "opened", "wal", writer.name(), "walBytes", writer.sizeBytes());
        return writer;
    }
}
