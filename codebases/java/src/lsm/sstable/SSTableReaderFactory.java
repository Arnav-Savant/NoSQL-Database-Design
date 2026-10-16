package lsm.sstable;

import lsm.io.StorageDirectory;
import lsm.logging.Logger;

/** Opens SSTables by file name with the store's shared hasher and logger. */
public final class SSTableReaderFactory {
    private final StorageDirectory directory;
    private final BloomHasher hasher;
    private final Logger logger;

    public SSTableReaderFactory(StorageDirectory directory, BloomHasher hasher, Logger logger) {
        this.directory = directory;
        this.hasher = hasher;
        this.logger = logger;
    }

    public SSTableReader open(String name) {
        return SSTableReader.open(directory, name, hasher, logger);
    }
}
