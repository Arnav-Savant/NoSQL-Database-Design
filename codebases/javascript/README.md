# LSM key-value store in JavaScript

A complete, dependency-free key-value storage engine built as a log-structured merge tree (LSM tree): a write-ahead log, a memtable that doubles as a cache, immutable SSTables with sparse indexes and Bloom filters, merge compaction with tombstones, and crash recovery.

It exists to make storage-engine internals readable. The code favours clarity over raw speed. Where a production engine would do more, a `NOTE:` comment says what and why.

This is the reference implementation. The [Python](../python/), [Java](../java/) and [C++](../cpp/) versions mirror its structure and file format, and their demos print the same log lines. For the concepts behind each file, see the [revision notes](../../docs/notes/README.md). For the project as a whole, see the [root README](../../README.md).

## Run the demo

Requires Node.js 22 or newer. There's nothing to install.

```bash
cd codebases/javascript
node demo/main.js        # or: npm run demo
```

The demo wipes and recreates `codebases/javascript/data/`, then walks through ten chapters:

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

It uses deliberately tiny limits (128-byte WAL, 64-byte blocks, 6-entry memtable, compaction at 3 tables) so that flushes, evictions and merges happen within a few writes. The files it leaves in `data/` can be inspected afterwards.

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

```js
import { createConfig } from './lsm/config/storeConfig.js';
import { ConsoleLogger } from './lsm/logging/consoleLogger.js';
import { StoreFactory } from './lsm/store/storeFactory.js';

const config = createConfig({ evictionPolicy: 'lfu' });
const store = StoreFactory.create(config, new ConsoleLogger('info'), './my-data');
store.open();
store.put('macbook', 'Apple');          // null, booleans, numbers and strings are accepted
store.get('macbook')?.display;          // '"Apple"'
store.delete('macbook');
store.close();
```

## Files, in reading order

| File | Concept | Notes |
|---|---|---|
| [`lsm/config/storeConfig.js`](lsm/config/storeConfig.js) | Tunable limits and the demo's tiny values | |
| [`lsm/logging/logger.js`](lsm/logging/logger.js), [`consoleLogger.js`](lsm/logging/consoleLogger.js) | The logging contract and its console implementation | |
| [`lsm/entry/value.js`](lsm/entry/value.js) | Self-describing values (null, boolean, number, string, tombstone) | [Stage 2](../../docs/notes/02-naive-key-value.md) |
| [`lsm/entry/entry.js`](lsm/entry/entry.js) | A key with its value; deletes are tombstone entries | [Stage 14](../../docs/notes/14-tombstones.md) |
| [`lsm/entry/entryCodec.js`](lsm/entry/entryCodec.js) | Length-prefixed binary encoding of entries | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/entry/keyOrder.js`](lsm/entry/keyOrder.js) | Byte-wise key ordering shared by every port | [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/io/crc32.js`](lsm/io/crc32.js) | Checksums that detect torn WAL records | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/io/fileNames.js`](lsm/io/fileNames.js) | `wal-NNNNNN.log` and `sst-MIN-MAX.sst` naming | [Stage 11](../../docs/notes/11-merge-compaction.md) |
| [`lsm/io/storageDirectory.js`](lsm/io/storageDirectory.js) | fsync, atomic rename, truncation | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/wal/walWriter.js`](lsm/wal/walWriter.js), [`walWriterFactory.js`](lsm/wal/walWriterFactory.js) | Appending checksummed records to the write-ahead log | [Stage 5](../../docs/notes/05-hash-index.md) |
| [`lsm/wal/walReader.js`](lsm/wal/walReader.js) | Replaying a WAL and finding a torn tail | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/memtable/memtable.js`](lsm/memtable/memtable.js) | Dirty and clean entries; eviction of clean entries only | [Stage 8](../../docs/notes/08-memtable.md), [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/memtable/eviction/`](lsm/memtable/eviction/) | LRU, LFU and FIFO eviction policies | [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/sstable/tableRange.js`](lsm/sstable/tableRange.js) | The WAL sequence range a table covers | [Stage 11](../../docs/notes/11-merge-compaction.md) |
| [`lsm/sstable/bloomHasher.js`](lsm/sstable/bloomHasher.js), [`bloomFilter.js`](lsm/sstable/bloomFilter.js) | Bloom filters | [Stage 15](../../docs/notes/15-bloom-filters.md) |
| [`lsm/sstable/sparseIndex.js`](lsm/sstable/sparseIndex.js) | First key and offset of each block | [Stage 13](../../docs/notes/13-sparse-index.md) |
| [`lsm/sstable/tableFormat.js`](lsm/sstable/tableFormat.js), [`sstableWriter.js`](lsm/sstable/sstableWriter.js) | Writing blocks, index, filter and footer | [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/sstable/sstableReader.js`](lsm/sstable/sstableReader.js), [`sstableReaderFactory.js`](lsm/sstable/sstableReaderFactory.js) | One block read per lookup, binary search inside it | [Stage 13](../../docs/notes/13-sparse-index.md) |
| [`lsm/compaction/`](lsm/compaction/) | Strategy, two-pointer merge, compactor | [Stage 11](../../docs/notes/11-merge-compaction.md), [Stage 14](../../docs/notes/14-tombstones.md) |
| [`lsm/recovery/recoveryManager.js`](lsm/recovery/recoveryManager.js) | Startup clean-up and WAL replay | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/store/contracts.js`](lsm/store/contracts.js) | Reader, writer, lifecycle and inspector contracts | |
| [`lsm/store/lsmStore.js`](lsm/store/lsmStore.js) | Write path, read path and flush | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/store/storeFactory.js`](lsm/store/storeFactory.js) | Wires concrete classes together | |
| [`demo/`](demo/) | The narrated ten-chapter walkthrough | |

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
