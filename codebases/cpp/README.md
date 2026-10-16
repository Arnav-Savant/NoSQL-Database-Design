# LSM key-value store in C++

A complete, dependency-free key-value storage engine built as a log-structured merge tree (LSM tree): a write-ahead log, a memtable that doubles as a cache, immutable SSTables with sparse indexes and Bloom filters, merge compaction with tombstones, and crash recovery.

It exists to make storage-engine internals readable. The code favours clarity over raw speed. Where a production engine would do more, a `NOTE:` comment says what and why.

This is a port of the [JavaScript reference implementation](../javascript/). It mirrors that code file for file, writes the same byte format (a table or WAL written by one port can be read by the other), and its demo prints exactly the same output. The [Python](../python/) and [Java](../java/) versions follow the same structure. For the concepts behind each file, see the [revision notes](../../docs/notes/README.md). For the project as a whole, see the [root README](../../README.md).

## Build and run the demo

Requires g++ with C++17 support (tested with g++ 13) on Linux or another POSIX system. It uses only the standard library and POSIX calls, so there's nothing to install and no build system is needed.

```bash
cd codebases/cpp
mkdir -p build
g++ -std=c++17 -O2 -Wall -Wextra -Wpedantic -I. $(find lsm demo -name '*.cpp') -o build/lsm_demo
./build/lsm_demo
```

Run it from `codebases/cpp`: the demo wipes and recreates `data/` relative to the working directory, then walks through ten chapters:

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

```cpp
#include "lsm/config/store_config.h"
#include "lsm/logging/console_logger.h"
#include "lsm/store/store_factory.h"

lsm::StoreConfig settings = lsm::kDefaultConfig;
settings.eviction_policy = "lfu";
const lsm::StoreConfig config = lsm::create_config(settings);

auto store = lsm::StoreFactory::create(config, std::make_shared<lsm::ConsoleLogger>("info"), "./my-data");
store->open();
store->put("macbook", lsm::Value::string("Apple"));  // null, booleans, numbers and strings are accepted
store->get("macbook")->display();                     // "\"Apple\""; get returns std::optional<lsm::Value>
store->remove("macbook");                             // delete is a C++ keyword, so the method is remove
store->close();
```

## Files, in reading order

| File | Concept | Notes |
|---|---|---|
| [`lsm/config/store_config.h`](lsm/config/store_config.h), [`.cpp`](lsm/config/store_config.cpp) | Tunable limits and the demo's tiny values | |
| [`lsm/logging/logger.h`](lsm/logging/logger.h), [`console_logger.h`](lsm/logging/console_logger.h), [`.cpp`](lsm/logging/console_logger.cpp) | The logging contract and its console implementation | |
| [`lsm/entry/value.h`](lsm/entry/value.h), [`.cpp`](lsm/entry/value.cpp) | Self-describing values (null, boolean, number, string, tombstone) | [Stage 2](../../docs/notes/02-naive-key-value.md) |
| [`lsm/entry/entry.h`](lsm/entry/entry.h) | A key with its value; deletes are tombstone entries | [Stage 14](../../docs/notes/14-tombstones.md) |
| [`lsm/entry/entry_codec.h`](lsm/entry/entry_codec.h), [`.cpp`](lsm/entry/entry_codec.cpp) | Length-prefixed binary encoding of entries | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/entry/key_order.h`](lsm/entry/key_order.h) | Byte-wise key ordering shared by every port | [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/io/big_endian.h`](lsm/io/big_endian.h) | Big-endian reads and writes used by every file format | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/io/crc32.h`](lsm/io/crc32.h), [`.cpp`](lsm/io/crc32.cpp) | Checksums that detect torn WAL records | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/io/file_names.h`](lsm/io/file_names.h), [`.cpp`](lsm/io/file_names.cpp) | `wal-NNNNNN.log` and `sst-MIN-MAX.sst` naming | [Stage 11](../../docs/notes/11-merge-compaction.md) |
| [`lsm/io/storage_directory.h`](lsm/io/storage_directory.h), [`.cpp`](lsm/io/storage_directory.cpp) | fsync, atomic rename, truncation | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/wal/wal_writer.h`](lsm/wal/wal_writer.h), [`.cpp`](lsm/wal/wal_writer.cpp), [`wal_writer_factory.h`](lsm/wal/wal_writer_factory.h), [`.cpp`](lsm/wal/wal_writer_factory.cpp) | Appending checksummed records to the write-ahead log | [Stage 5](../../docs/notes/05-hash-index.md) |
| [`lsm/wal/wal_reader.h`](lsm/wal/wal_reader.h), [`.cpp`](lsm/wal/wal_reader.cpp) | Replaying a WAL and finding a torn tail | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/memtable/memtable.h`](lsm/memtable/memtable.h), [`.cpp`](lsm/memtable/memtable.cpp) | Dirty and clean entries; eviction of clean entries only | [Stage 8](../../docs/notes/08-memtable.md), [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/memtable/eviction/`](lsm/memtable/eviction/) | LRU, LFU and FIFO eviction policies | [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/sstable/table_range.h`](lsm/sstable/table_range.h) | The WAL sequence range a table covers | [Stage 11](../../docs/notes/11-merge-compaction.md) |
| [`lsm/sstable/bloom_hasher.h`](lsm/sstable/bloom_hasher.h), [`.cpp`](lsm/sstable/bloom_hasher.cpp), [`bloom_filter.h`](lsm/sstable/bloom_filter.h), [`.cpp`](lsm/sstable/bloom_filter.cpp) | Bloom filters | [Stage 15](../../docs/notes/15-bloom-filters.md) |
| [`lsm/sstable/sparse_index.h`](lsm/sstable/sparse_index.h), [`.cpp`](lsm/sstable/sparse_index.cpp) | First key and offset of each block | [Stage 13](../../docs/notes/13-sparse-index.md) |
| [`lsm/sstable/table_format.h`](lsm/sstable/table_format.h), [`sstable_writer.h`](lsm/sstable/sstable_writer.h), [`.cpp`](lsm/sstable/sstable_writer.cpp) | Writing blocks, index, filter and footer | [Stage 10](../../docs/notes/10-sstable-flush.md) |
| [`lsm/sstable/sstable_reader.h`](lsm/sstable/sstable_reader.h), [`.cpp`](lsm/sstable/sstable_reader.cpp), [`sstable_reader_factory.h`](lsm/sstable/sstable_reader_factory.h), [`.cpp`](lsm/sstable/sstable_reader_factory.cpp) | One block read per lookup, binary search inside it | [Stage 13](../../docs/notes/13-sparse-index.md) |
| [`lsm/compaction/`](lsm/compaction/) | Strategy, two-pointer merge, compactor | [Stage 11](../../docs/notes/11-merge-compaction.md), [Stage 14](../../docs/notes/14-tombstones.md) |
| [`lsm/recovery/recovery_manager.h`](lsm/recovery/recovery_manager.h), [`.cpp`](lsm/recovery/recovery_manager.cpp) | Startup clean-up and WAL replay | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/store/contracts.h`](lsm/store/contracts.h) | Reader, writer, lifecycle and inspector contracts | |
| [`lsm/store/lsm_store.h`](lsm/store/lsm_store.h), [`.cpp`](lsm/store/lsm_store.cpp) | Write path, read path and flush | [Stage 16](../../docs/notes/16-complete-lsm.md) |
| [`lsm/store/store_factory.h`](lsm/store/store_factory.h), [`.cpp`](lsm/store/store_factory.cpp) | Wires concrete classes together | |
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

C++ specifics:
- Contracts (`EvictionPolicy`, `CompactionStrategy`, `KeyValueReader`, `KeyValueWriter`, `Lifecycle`, `StoreInspector`, `Logger`) are abstract classes with pure virtual methods. Dependencies arrive through constructors as `std::unique_ptr` or `std::shared_ptr`, and `StoreFactory::create` is the only place concrete classes are chosen.
- A `Value` is a `ValueType` tag plus a `std::variant<std::monostate, bool, double, std::string>`; `get` returns `std::optional<Value>`.
- File access goes through `StorageDirectory`, which uses `std::filesystem` for listing and paths and POSIX `open`/`write`/`fsync`/`ftruncate` (wrapped in an RAII handle) for durability.
