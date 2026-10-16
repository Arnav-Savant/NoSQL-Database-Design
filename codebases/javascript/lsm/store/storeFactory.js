import { Compactor } from '../compaction/compactor.js';
import { EntryMerger } from '../compaction/entryMerger.js';
import { OldestPairStrategy } from '../compaction/oldestPairStrategy.js';
import { StorageDirectory } from '../io/storageDirectory.js';
import { FifoEvictionPolicy } from '../memtable/eviction/fifoEvictionPolicy.js';
import { LfuEvictionPolicy } from '../memtable/eviction/lfuEvictionPolicy.js';
import { LruEvictionPolicy } from '../memtable/eviction/lruEvictionPolicy.js';
import { Memtable } from '../memtable/memtable.js';
import { RecoveryManager } from '../recovery/recoveryManager.js';
import { BloomHasher } from '../sstable/bloomHasher.js';
import { SSTableReaderFactory } from '../sstable/sstableReaderFactory.js';
import { SSTableWriter } from '../sstable/sstableWriter.js';
import { WalWriterFactory } from '../wal/walWriterFactory.js';
import { KeyValueReader, KeyValueWriter, StoreInspector, assertImplements } from './contracts.js';
import { LsmStore } from './lsmStore.js';

const EVICTION_POLICIES = Object.freeze({
  lru: () => new LruEvictionPolicy(),
  lfu: () => new LfuEvictionPolicy(),
  fifo: () => new FifoEvictionPolicy(),
});

/** The one place where concrete implementations are chosen and wired together. */
export class StoreFactory {
  static create(config, logger, dataDirectory) {
    const createPolicy = EVICTION_POLICIES[config.evictionPolicy];
    if (!createPolicy) throw new Error(`Unknown eviction policy "${config.evictionPolicy}". Use lru, lfu or fifo.`);

    const directory = new StorageDirectory(dataDirectory);
    const hasher = new BloomHasher();
    const tableWriter = new SSTableWriter(directory, config, hasher, logger);
    const tableReaderFactory = new SSTableReaderFactory(directory, hasher, logger);
    const compactor = new Compactor(
      new OldestPairStrategy(config.compactionTrigger),
      new EntryMerger(),
      tableWriter,
      tableReaderFactory,
      directory,
      logger,
    );

    const store = new LsmStore({
      config,
      directory,
      logger,
      memtable: new Memtable(config.memtableCapacity, createPolicy(), logger),
      walFactory: new WalWriterFactory(directory, logger),
      tableWriter,
      tableReaderFactory,
      compactor,
      recoveryManager: new RecoveryManager(directory, tableReaderFactory, logger),
    });
    assertImplements(store, [KeyValueReader, KeyValueWriter, StoreInspector]);
    return store;
  }
}
