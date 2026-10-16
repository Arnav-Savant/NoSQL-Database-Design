package lsm.store;

import java.nio.file.Path;
import java.util.Map;
import java.util.function.Supplier;
import lsm.compaction.Compactor;
import lsm.compaction.EntryMerger;
import lsm.compaction.OldestPairStrategy;
import lsm.config.StoreConfig;
import lsm.io.StorageDirectory;
import lsm.logging.Logger;
import lsm.memtable.Memtable;
import lsm.memtable.eviction.EvictionPolicy;
import lsm.memtable.eviction.FifoEvictionPolicy;
import lsm.memtable.eviction.LfuEvictionPolicy;
import lsm.memtable.eviction.LruEvictionPolicy;
import lsm.recovery.RecoveryManager;
import lsm.sstable.BloomHasher;
import lsm.sstable.SSTableReaderFactory;
import lsm.sstable.SSTableWriter;
import lsm.wal.WalWriterFactory;

/** The one place where concrete implementations are chosen and wired together. */
public final class StoreFactory {
    private static final Map<String, Supplier<EvictionPolicy>> EVICTION_POLICIES = Map.of(
            "lru", LruEvictionPolicy::new,
            "lfu", LfuEvictionPolicy::new,
            "fifo", FifoEvictionPolicy::new);

    private StoreFactory() {
    }

    public static LsmStore create(StoreConfig config, Logger logger, Path dataDirectory) {
        Supplier<EvictionPolicy> createPolicy = EVICTION_POLICIES.get(config.evictionPolicy());
        if (createPolicy == null) {
            throw new IllegalArgumentException(
                    "Unknown eviction policy \"" + config.evictionPolicy() + "\". Use lru, lfu or fifo.");
        }

        StorageDirectory directory = new StorageDirectory(dataDirectory);
        BloomHasher hasher = new BloomHasher();
        SSTableWriter tableWriter = new SSTableWriter(directory, config, hasher, logger);
        SSTableReaderFactory tableReaderFactory = new SSTableReaderFactory(directory, hasher, logger);
        Compactor compactor = new Compactor(
                new OldestPairStrategy(config.compactionTrigger()),
                new EntryMerger(),
                tableWriter,
                tableReaderFactory,
                directory,
                logger);

        // The compiler checks that LsmStore implements every contract, so no runtime assertion is needed.
        return new LsmStore(
                config,
                directory,
                logger,
                new Memtable(config.memtableCapacity(), createPolicy.get(), logger),
                new WalWriterFactory(directory, logger),
                tableWriter,
                tableReaderFactory,
                compactor,
                new RecoveryManager(directory, tableReaderFactory, logger));
    }
}
