# LSM key-value store in Python

A complete, dependency-free key-value storage engine built as a log-structured merge tree (LSM tree): a write-ahead log, a memtable that doubles as a cache, immutable SSTables with sparse indexes and Bloom filters, merge compaction with tombstones, and crash recovery.

It exists to make storage-engine internals readable. The code favours clarity over raw speed. Where a production engine would do more, a `NOTE:` comment says what and why.

This is a port of the [JavaScript](../javascript/) version, which is the reference implementation. It mirrors that version file for file, reads and writes the same file format, and its demo prints exactly the same output. The [Java](../java/) and [C++](../cpp/) versions follow the same rules. For the concepts behind each file, see the [revision notes](../../docs/notes/README.md). For the project as a whole, see the [root README](../../README.md).

## Run the demo

Requires Python 3.12 or newer. There's nothing to install: only the standard library is used.

```bash
cd codebases/python
python3 -m demo.main
```

The demo wipes and recreates `codebases/python/data/`, then walks through ten chapters:

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

It uses deliberately tiny limits (128-byte WAL, 64-byte blocks, 6-entry memtable, compaction at 3 tables) so that flushes, evictions and merges happen within a few writes. The files it leaves in `data/` can be inspected afterwards, and they are byte-for-byte the same as the ones the JavaScript demo leaves.

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

```python
from lsm.config.store_config import create_config
from lsm.logging.console_logger import ConsoleLogger
from lsm.store.store_factory import StoreFactory

config = create_config({"eviction_policy": "lfu"})
store = StoreFactory.create(config, ConsoleLogger("info"), "./my-data")
store.open()
store.put("macbook", "Apple")           # None, bools, ints, floats and strings are accepted
store.get("macbook").display            # '"Apple"'
store.delete("macbook")
store.close()
```

## Files, in reading order

| File | Concept | Notes |
|---|---|---|
| [`lsm/config/store_config.py`](lsm/config/store_config.py) | Tunable limits and the demo's tiny values | |
| [`lsm/logging/logger.py`](lsm/logging/logger.py), [`console_logger.py`](lsm/logging/console_logger.py) | The logging contract and its console implementation | |
| [`lsm/entry/value.py`](lsm/entry/value.py) | Self-describing values (null, boolean, number, string, tombstone) | [Stage 2](../../docs/notes/02-naive-key-value.md) |
| [`lsm/entry/entry.py`](lsm/entry/entry.py) | A key with its value; deletes are tombstone entries | [Stage 14](../../docs/notes/14-tombstones.md) |
| [`lsm/entry/entry_codec.py`](lsm/entry/entry_codec.py) | Length-prefixed binary encoding of entries | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/entry/key_order.py`](lsm/entry/key_order.py) | Byte-wise key ordering shared by every port | [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/io/crc32.py`](lsm/io/crc32.py) | Checksums that detect torn WAL records | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/io/file_names.py`](lsm/io/file_names.py) | `wal-NNNNNN.log` and `sst-MIN-MAX.sst` naming | [Stage 11](../../docs/notes/11-merge-compaction.md) |
| [`lsm/io/storage_directory.py`](lsm/io/storage_directory.py) | fsync, atomic rename, truncation | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/wal/wal_writer.py`](lsm/wal/wal_writer.py), [`wal_writer_factory.py`](lsm/wal/wal_writer_factory.py) | Appending checksummed records to the write-ahead log | [Stage 5](../../docs/notes/05-hash-index.md) |
| [`lsm/wal/wal_reader.py`](lsm/wal/wal_reader.py) | Replaying a WAL and finding a torn tail | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/memtable/memtable.py`](lsm/memtable/memtable.py) | Dirty and clean entries; eviction of clean entries only | [Stage 8](../../docs/notes/08-memtable.md), [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/memtable/eviction/`](lsm/memtable/eviction/) | LRU, LFU and FIFO eviction policies | [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/sstable/table_range.py`](lsm/sstable/table_range.py) | The WAL sequence range a table covers | [Stage 11](../../docs/notes/11-merge-compaction.md) |
| [`lsm/sstable/bloom_hasher.py`](lsm/sstable/bloom_hasher.py), [`bloom_filter.py`](lsm/sstable/bloom_filter.py) | Bloom filters | [Stage 15](../../docs/notes/15-bloom-filters.md) |
| [`lsm/sstable/sparse_index.py`](lsm/sstable/sparse_index.py) | First key and offset of each block | [Stage 13](../../docs/notes/13-sparse-index.md) |
| [`lsm/sstable/table_format.py`](lsm/sstable/table_format.py), [`sstable_writer.py`](lsm/sstable/sstable_writer.py) | Writing blocks, index, filter and footer | [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/sstable/sstable_reader.py`](lsm/sstable/sstable_reader.py), [`sstable_reader_factory.py`](lsm/sstable/sstable_reader_factory.py) | One block read per lookup, binary search inside it | [Stage 13](../../docs/notes/13-sparse-index.md) |
| [`lsm/compaction/`](lsm/compaction/) | Strategy, two-pointer merge, compactor | [Stage 11](../../docs/notes/11-merge-compaction.md), [Stage 14](../../docs/notes/14-tombstones.md) |
| [`lsm/recovery/recovery_manager.py`](lsm/recovery/recovery_manager.py) | Startup clean-up and WAL replay | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/store/contracts.py`](lsm/store/contracts.py) | Reader, writer, lifecycle and inspector contracts | |
| [`lsm/store/lsm_store.py`](lsm/store/lsm_store.py) | Write path, read path and flush | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/store/store_factory.py`](lsm/store/store_factory.py) | Wires concrete classes together | |
| [`demo/`](demo/) | The narrated ten-chapter walkthrough | |

## Design in brief

- **Write path:** append to the WAL and fsync, then store the key in the memtable as dirty. A write that finds the memtable full evicts one clean entry first. Flush when the WAL reaches `wal_max_bytes` or every memtable slot is dirty.
- **Read path:** memtable first. Then SSTables newest to oldest: Bloom filter, sparse index, one block, binary search. A hit from disk is cached as clean.
- **Flush:** sort the dirty entries and write `sst-MIN-MAX.sst` atomically (temporary file, fsync, rename). Mark the entries clean, open the next WAL, delete the old one, then compact if the table count has reached `compaction_trigger`.
- **Compaction:** merge the two oldest tables; on equal keys the newer entry wins. Tombstones are dropped only when the merge includes the oldest table.
- **Recovery:**
  1. Delete `*.tmp` files.
  2. Delete tables whose range sits inside another table's range.
  3. Delete WALs already covered by a table.
  4. Replay the rest, truncating a torn tail.

Contracts (`EvictionPolicy`, `CompactionStrategy`, `KeyValueReader`, `KeyValueWriter`, `Lifecycle`, `StoreInspector`) are `typing.Protocol` classes and `Logger` is an `abc.ABC`. Every dependency arrives through a constructor, and `StoreFactory.create` is the only place that picks concrete classes.
