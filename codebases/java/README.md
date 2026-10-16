# LSM key-value store in Java

A complete, dependency-free key-value storage engine built as a log-structured merge tree (LSM tree): a write-ahead log, a memtable that doubles as a cache, immutable SSTables with sparse indexes and Bloom filters, merge compaction with tombstones, and crash recovery.

It exists to make storage-engine internals readable. The code favours clarity over raw speed. Where a production engine would do more, a `NOTE:` comment says what and why.

This is a port of the [JavaScript reference implementation](../javascript/). It mirrors that version file for file, reads and writes the same file format, and its demo prints byte-for-byte the same output. The [Python](../python/) and [C++](../cpp/) versions do the same. For the concepts behind each file, see the [revision notes](../../docs/notes/README.md). For the project as a whole, see the [root README](../../README.md).

## Run the demo

Requires JDK 17 or newer. Only the standard library is used; there is no build tool and nothing to install.

```bash
cd codebases/java
rm -rf out && javac --release 17 -Xlint:all -d out $(find src -name '*.java')
java -cp out demo.Main
```

Run it from `codebases/java`: the demo wipes and recreates `data/` under the working directory, then walks through ten chapters:

1. Opening an empty store
2. First writes
3. Values without a schema
4. Inside the first SSTable
5. Reads served from memory
6. Filling the cache
7. Reads that reach the disk
8. Deleting a key
9. Compaction
10. Crash and recovery

It uses deliberately tiny limits (128-byte WAL, 64-byte blocks, 6-entry memtable, compaction at 3 tables) so that flushes, evictions and merges happen within a few writes. The files it leaves in `data/` can be inspected afterwards, and are byte-identical to the ones the JavaScript demo leaves.

## Reading the output

Each chapter has three kinds of output:
- a short explanation;
- the operations (`> put macbook = "Apple"`, `> get watch`);
- the store's own log lines.

Log lines have one shape:

```
[LEVEL] [Component  ] message  key=value key=value
[DEBUG] [Read       ] bloom filter says definitely absent, table skipped  key=nokia table=sst-000002-000002.sst
```

- `DEBUG` shows each internal step.
- `INFO` shows lifecycle events: flush, compaction, WAL roll-over, recovery.
- `WARN` shows something recovery had to repair.

After key steps the demo prints a snapshot:
- the active WAL and its size;
- every memtable entry with its value and whether it is `dirty` (only in the WAL so far) or `clean` (already in an SSTable);
- every SSTable, newest first, with its blocks and how many Bloom filter bits are set.

## Using the store in code

```java
import java.nio.file.Path;
import lsm.config.StoreConfig;
import lsm.entry.Value;
import lsm.logging.ConsoleLogger;
import lsm.logging.LogLevel;
import lsm.store.LsmStore;
import lsm.store.StoreFactory;

StoreConfig config = StoreConfig.DEFAULT_CONFIG.withEvictionPolicy("lfu");
LsmStore store = StoreFactory.create(config, new ConsoleLogger(LogLevel.INFO), Path.of("my-data"));
store.open();
store.put("macbook", Value.from("Apple"));          // null, booleans, numbers and strings are accepted
store.get("macbook").map(Value::display).orElse("absent");   // "\"Apple\""
store.delete("macbook");
store.close();
```

## Files, in reading order

| File | Concept | Notes |
|---|---|---|
| [`lsm/config/StoreConfig.java`](src/lsm/config/StoreConfig.java) | Tunable limits and the demo's tiny values | |
| [`lsm/logging/Logger.java`](src/lsm/logging/Logger.java), [`LogLevel.java`](src/lsm/logging/LogLevel.java), [`ConsoleLogger.java`](src/lsm/logging/ConsoleLogger.java) | The logging contract and its console implementation | |
| [`lsm/entry/ValueType.java`](src/lsm/entry/ValueType.java), [`Value.java`](src/lsm/entry/Value.java) | Self-describing values (null, boolean, number, string, tombstone) | [Stage 2](../../docs/notes/02-naive-key-value.md) |
| [`lsm/entry/Entry.java`](src/lsm/entry/Entry.java) | A key with its value; deletes are tombstone entries | [Stage 14](../../docs/notes/14-tombstones.md) |
| [`lsm/entry/EntryCodec.java`](src/lsm/entry/EntryCodec.java) | Length-prefixed binary encoding of entries | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/entry/KeyOrder.java`](src/lsm/entry/KeyOrder.java) | Byte-wise key ordering shared by every port | [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/io/Crc32.java`](src/lsm/io/Crc32.java) | Checksums that detect torn WAL records | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/io/FileNames.java`](src/lsm/io/FileNames.java) | `wal-NNNNNN.log` and `sst-MIN-MAX.sst` naming | [Stage 11](../../docs/notes/11-merge-compaction.md) |
| [`lsm/io/StorageDirectory.java`](src/lsm/io/StorageDirectory.java) | fsync, atomic rename, truncation | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/wal/WalWriter.java`](src/lsm/wal/WalWriter.java), [`WalWriterFactory.java`](src/lsm/wal/WalWriterFactory.java) | Appending checksummed records to the write-ahead log | [Stage 5](../../docs/notes/05-hash-index.md) |
| [`lsm/wal/WalReader.java`](src/lsm/wal/WalReader.java), [`WalReplay.java`](src/lsm/wal/WalReplay.java) | Replaying a WAL and finding a torn tail | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/memtable/Memtable.java`](src/lsm/memtable/Memtable.java), [`EntryState.java`](src/lsm/memtable/EntryState.java), [`MemtableSlot.java`](src/lsm/memtable/MemtableSlot.java) | Dirty and clean entries; eviction of clean entries only | [Stage 8](../../docs/notes/08-memtable.md), [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/memtable/eviction/`](src/lsm/memtable/eviction/) | LRU, LFU and FIFO eviction policies | [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/sstable/TableRange.java`](src/lsm/sstable/TableRange.java) | The WAL sequence range a table covers | [Stage 11](../../docs/notes/11-merge-compaction.md) |
| [`lsm/sstable/BloomHasher.java`](src/lsm/sstable/BloomHasher.java), [`BloomFilter.java`](src/lsm/sstable/BloomFilter.java) | Bloom filters | [Stage 15](../../docs/notes/15-bloom-filters.md) |
| [`lsm/sstable/BlockHandle.java`](src/lsm/sstable/BlockHandle.java), [`SparseIndex.java`](src/lsm/sstable/SparseIndex.java) | First key and offset of each block | [Stage 13](../../docs/notes/13-sparse-index.md) |
| [`lsm/sstable/TableFormat.java`](src/lsm/sstable/TableFormat.java), [`SSTableWriter.java`](src/lsm/sstable/SSTableWriter.java) | Writing blocks, index, filter and footer | [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/sstable/SSTableReader.java`](src/lsm/sstable/SSTableReader.java), [`SSTableReaderFactory.java`](src/lsm/sstable/SSTableReaderFactory.java) | One block read per lookup, binary search inside it | [Stage 13](../../docs/notes/13-sparse-index.md) |
| [`lsm/compaction/`](src/lsm/compaction/) | Strategy, two-pointer merge, compactor | [Stage 11](../../docs/notes/11-merge-compaction.md), [Stage 14](../../docs/notes/14-tombstones.md) |
| [`lsm/recovery/RecoveryManager.java`](src/lsm/recovery/RecoveryManager.java), [`RecoveredState.java`](src/lsm/recovery/RecoveredState.java) | Startup clean-up and WAL replay | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/store/KeyValueReader.java`](src/lsm/store/KeyValueReader.java), [`KeyValueWriter.java`](src/lsm/store/KeyValueWriter.java), [`Lifecycle.java`](src/lsm/store/Lifecycle.java), [`StoreInspector.java`](src/lsm/store/StoreInspector.java), [`StoreSnapshot.java`](src/lsm/store/StoreSnapshot.java) | Reader, writer, lifecycle and inspector contracts | |
| [`lsm/store/LsmStore.java`](src/lsm/store/LsmStore.java) | Write path, read path and flush | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/store/StoreFactory.java`](src/lsm/store/StoreFactory.java) | Wires concrete classes together | |
| [`demo/`](src/demo/) | The narrated ten-chapter walkthrough | |

## Design in brief

- **Write path:** append to the WAL and fsync, then store the key in the memtable as dirty. A write that finds the memtable full evicts one clean entry first. Flush when the WAL reaches `walMaxBytes` or every memtable slot is dirty.
- **Read path:** memtable first. Then SSTables newest to oldest: Bloom filter, sparse index, one block, binary search. A hit from disk is cached as clean.
- **Flush:** sort the dirty entries and write `sst-MIN-MAX.sst` atomically (temporary file, fsync, rename). Mark the entries clean, open the next WAL, delete the old one, then compact if the table count has reached `compactionTrigger`.
- **Compaction:** merge the two oldest tables; on equal keys the newer entry wins. Tombstones are dropped only when the merge includes the oldest table.
- **Recovery:**
  1. Delete `*.tmp` files.
  2. Delete tables whose range sits inside another table's range.
  3. Delete WALs already covered by a table.
  4. Replay the rest, truncating a torn tail.

The contracts (`KeyValueReader`, `KeyValueWriter`, `Lifecycle`, `StoreInspector`, `EvictionPolicy`, `CompactionStrategy`, `Logger`) are Java interfaces, every dependency arrives through a constructor, and `StoreFactory.create` is the only place concrete classes are chosen.
