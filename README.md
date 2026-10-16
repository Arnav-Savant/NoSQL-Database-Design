# Storage engine anatomy

A hands-on project for learning how a key-value database works on the inside: how it stores data on disk, keeps it safe through crashes, finds a key quickly among millions, and cleans up after itself.

Instead of presenting the finished design all at once, it builds the design the way an engineer would: start with the simplest thing that could work, find what breaks, fix that, and repeat. Seventeen stages take you from a relational table to a complete **log-structured merge tree (LSM tree)**, the storage design behind databases such as Cassandra, ScyllaDB, RocksDB, LevelDB and Bigtable. Every stage answers three questions: what problem forced this change, how does the change work, and what does it cost.

## What's inside

| Part | What it is | Start here |
|---|---|---|
| **Visualizer** | An interactive web app. Each stage shows RAM and disk side by side, and scripted walkthroughs step through every read, write, flush, merge and recovery, with the matching code highlighted line by line. | [`visualizer/`](visualizer/) |
| **Codebases** | A complete, working LSM-tree storage engine written four times, in [Java](codebases/java/), [Python](codebases/python/), [JavaScript](codebases/javascript/) and [C++](codebases/cpp/). All four have the same structure, write byte-identical files, and ship a narrated demo. | [`codebases/javascript/README.md`](codebases/javascript/README.md) |
| **Revision notes** | Written notes for every stage, with worked examples, trade-off tables and self-test questions, plus a glossary and a one-page cheat sheet. | [`docs/notes/README.md`](docs/notes/README.md) |

A good way to use them together:
1. Read a stage in the visualizer and step through its walkthroughs.
2. Open the same stage's [revision note](docs/notes/README.md) and answer its questions.
3. Look at the real implementation through the visualizer's **Code** page, or the [codebases](codebases/).
4. When you reach the end, read the [whole database in one class](visualizer/content/whole-database/) and run a demo.

## Concepts and definitions

Each term starts with a plain definition, then the precise one. The links point to the stage note that introduces it and to the file that implements it in each language.

| Concept | Plain meaning | Precise meaning | Note | Java | Python | JavaScript | C++ |
|---|---|---|---|---|---|---|---|
| **Sequential vs random access** | Reading bytes next to each other is cheap; jumping around is expensive. | A spinning disk needs about 10 ms to seek; once there, neighbouring bytes stream quickly. RAM takes about 100 ns per access. | [0](docs/notes/00-requirements.md) | | | | |
| **Unstructured value** | A value can be any type, and can change type. | Each value is stored with a type tag and a length, so no schema is needed. | [2](docs/notes/02-naive-key-value.md) | [Value](codebases/java/src/lsm/entry/Value.java) | [value](codebases/python/lsm/entry/value.py) | [value](codebases/javascript/lsm/entry/value.js) | [value](codebases/cpp/lsm/entry/value.cpp) |
| **Append-only** | Only ever add to the end; never edit what's written. | Updates and deletes become new records. The newest record for a key is the current value; older ones are stale. | [4](docs/notes/04-append-only.md) | [EntryCodec](codebases/java/src/lsm/entry/EntryCodec.java) | [entry_codec](codebases/python/lsm/entry/entry_codec.py) | [entryCodec](codebases/javascript/lsm/entry/entryCodec.js) | [entry_codec](codebases/cpp/lsm/entry/entry_codec.cpp) |
| **Write-ahead log (WAL)** | The file every write goes to first. | An append-only, fsynced log. A write is durable once its record is in the WAL, and the log is replayed after a crash. | [5](docs/notes/05-hash-index.md) | [WalWriter](codebases/java/src/lsm/wal/WalWriter.java) | [wal_writer](codebases/python/lsm/wal/wal_writer.py) | [walWriter](codebases/javascript/lsm/wal/walWriter.js) | [wal_writer](codebases/cpp/lsm/wal/wal_writer.cpp) |
| **Memtable** | The in-memory part of the database. | A map in RAM holding the newest value of recently written keys and a cache of recently read ones. | [8](docs/notes/08-memtable.md) | [Memtable](codebases/java/src/lsm/memtable/Memtable.java) | [memtable](codebases/python/lsm/memtable/memtable.py) | [memtable](codebases/javascript/lsm/memtable/memtable.js) | [memtable](codebases/cpp/lsm/memtable/memtable.cpp) |
| **Dirty and clean entries** | Dirty means "only in the WAL so far"; clean means "already saved in a table". | Only clean entries may be evicted. Evicting a dirty entry would make reads return an older value from disk. | [10](docs/notes/10-sstable-flush.md) | [EntryState](codebases/java/src/lsm/memtable/EntryState.java) | [memtable](codebases/python/lsm/memtable/memtable.py) | [memtable](codebases/javascript/lsm/memtable/memtable.js) | [memtable](codebases/cpp/lsm/memtable/memtable.h) |
| **Eviction policy** | The rule for what leaves memory when it's full. | LRU drops the least recently used entry, LFU the least frequently used, FIFO the oldest inserted. | [10](docs/notes/10-sstable-flush.md) | [LRU](codebases/java/src/lsm/memtable/eviction/LruEvictionPolicy.java) | [lru](codebases/python/lsm/memtable/eviction/lru_eviction_policy.py) | [lru](codebases/javascript/lsm/memtable/eviction/lruEvictionPolicy.js) | [lru](codebases/cpp/lsm/memtable/eviction/lru_eviction_policy.cpp) |
| **Flush** | Moving recent writes from memory into a permanent sorted file. | Sort the dirty entries, write an SSTable atomically, mark the entries clean, start a new WAL, delete the old one. | [10](docs/notes/10-sstable-flush.md) | [LsmStore](codebases/java/src/lsm/store/LsmStore.java) | [lsm_store](codebases/python/lsm/store/lsm_store.py) | [lsmStore](codebases/javascript/lsm/store/lsmStore.js) | [lsm_store](codebases/cpp/lsm/store/lsm_store.cpp) |
| **SSTable** | A permanent, sorted file with no duplicates. | Sorted String Table: immutable, one entry per key, laid out as data blocks, then a sparse index, then a Bloom filter, then a footer. | [10](docs/notes/10-sstable-flush.md) | [SSTableWriter](codebases/java/src/lsm/sstable/SSTableWriter.java) | [sstable_writer](codebases/python/lsm/sstable/sstable_writer.py) | [sstableWriter](codebases/javascript/lsm/sstable/sstableWriter.js) | [sstable_writer](codebases/cpp/lsm/sstable/sstable_writer.cpp) |
| **Key order** | Keys sort the way their bytes compare. | Unsigned UTF-8 byte order, identical in every language, so a table written by one port can be searched by another. | [10](docs/notes/10-sstable-flush.md) | [KeyOrder](codebases/java/src/lsm/entry/KeyOrder.java) | [key_order](codebases/python/lsm/entry/key_order.py) | [keyOrder](codebases/javascript/lsm/entry/keyOrder.js) | [key_order](codebases/cpp/lsm/entry/key_order.h) |
| **Compaction** | Cleaning up old versions in the background. | Two sorted tables are merged with two pointers; on equal keys the newer entry wins. The output is named by the range of WAL numbers it covers. | [11](docs/notes/11-merge-compaction.md) | [Compactor](codebases/java/src/lsm/compaction/Compactor.java) | [compactor](codebases/python/lsm/compaction/compactor.py) | [compactor](codebases/javascript/lsm/compaction/compactor.js) | [compactor](codebases/cpp/lsm/compaction/compactor.cpp) |
| **Sequence number** | A counter that orders files by age. | Each WAL takes the next number. A table is named `sst-MIN-MAX.sst` after the range it covers, which decides read order. | [11](docs/notes/11-merge-compaction.md) | [TableRange](codebases/java/src/lsm/sstable/TableRange.java) | [table_range](codebases/python/lsm/sstable/table_range.py) | [tableRange](codebases/javascript/lsm/sstable/tableRange.js) | [table_range](codebases/cpp/lsm/sstable/table_range.h) |
| **Block and sparse index** | A short list of where each chunk of a table starts. | Entries are packed into blocks. The index stores each block's first key and offset, so a lookup reads exactly one block. | [13](docs/notes/13-sparse-index.md) | [SparseIndex](codebases/java/src/lsm/sstable/SparseIndex.java) | [sparse_index](codebases/python/lsm/sstable/sparse_index.py) | [sparseIndex](codebases/javascript/lsm/sstable/sparseIndex.js) | [sparse_index](codebases/cpp/lsm/sstable/sparse_index.cpp) |
| **Tombstone** | A "this key is deleted" marker. | A distinct entry type written by a delete. It hides older values and is dropped only when no older table could still hold the key. | [14](docs/notes/14-tombstones.md) | [Entry](codebases/java/src/lsm/entry/Entry.java) | [entry](codebases/python/lsm/entry/entry.py) | [entry](codebases/javascript/lsm/entry/entry.js) | [entry](codebases/cpp/lsm/entry/entry.h) |
| **Bloom filter** | A tiny summary that says "definitely not here" or "maybe here". | An m-bit array and k hash functions. Any 0 among a key's bits proves the key is absent; all 1s can be a false positive. | [15](docs/notes/15-bloom-filters.md) | [BloomFilter](codebases/java/src/lsm/sstable/BloomFilter.java) | [bloom_filter](codebases/python/lsm/sstable/bloom_filter.py) | [bloomFilter](codebases/javascript/lsm/sstable/bloomFilter.js) | [bloom_filter](codebases/cpp/lsm/sstable/bloom_filter.cpp) |
| **fsync and atomic rename** | "Really put this on the disk now", and publish a file only when it's complete. | Data is flushed to the device before a write is acknowledged. A table is written to `*.tmp`, synced, then renamed. | [16](docs/notes/16-complete-lsm.md) | [StorageDirectory](codebases/java/src/lsm/io/StorageDirectory.java) | [storage_directory](codebases/python/lsm/io/storage_directory.py) | [storageDirectory](codebases/javascript/lsm/io/storageDirectory.js) | [storage_directory](codebases/cpp/lsm/io/storage_directory.cpp) |
| **Checksum and torn write** | A fingerprint that spots a half-written record. | Every WAL record carries a CRC-32. Recovery stops at the first record that is incomplete or fails the check, and truncates there. | [16](docs/notes/16-complete-lsm.md) | [WalReader](codebases/java/src/lsm/wal/WalReader.java) | [wal_reader](codebases/python/lsm/wal/wal_reader.py) | [walReader](codebases/javascript/lsm/wal/walReader.js) | [wal_reader](codebases/cpp/lsm/wal/wal_reader.cpp) |
| **Recovery** | Getting back to a consistent state after a crash. | Delete temporary files, drop tables superseded by a finished merge, delete WALs already flushed, then replay the rest. | [16](docs/notes/16-complete-lsm.md) | [RecoveryManager](codebases/java/src/lsm/recovery/RecoveryManager.java) | [recovery_manager](codebases/python/lsm/recovery/recovery_manager.py) | [recoveryManager](codebases/javascript/lsm/recovery/recoveryManager.js) | [recovery_manager](codebases/cpp/lsm/recovery/recovery_manager.cpp) |

The full list, with every term, is in the [glossary](docs/notes/glossary.md).

## How the architecture evolves

The design is judged against five requirements: fast reads, fast writes (the priority), durability, unstructured values, and room for a few petabytes. Each stage fixes the problem the previous one left behind.

| # | Stage | Problem it addresses | Change it makes |
|---|---|---|---|
| 0 | [Requirements](docs/notes/00-requirements.md) | What does "good" mean? | Five requirements and two facts about hardware |
| 1 | [Relational rows](docs/notes/01-relational-rows.md) | A baseline is needed | A fixed schema makes every address computable |
| 2 | [A naive key-value file](docs/notes/02-naive-key-value.md) | Values need to be unstructured | Variable-length keys break the jumps, and growing values corrupt their neighbours |
| 3 | [Splitting values with pointers](docs/notes/03-pointer-splitting.md) | Corruption | Spill the overflow elsewhere, at the cost of random seeks |
| 4 | [Append instead of overwrite](docs/notes/04-append-only.md) | Editing in place is the root cause | Every change is a new record at the end |
| 5 | [An in-memory hash index](docs/notes/05-hash-index.md) | Reads scan the whole log | A map in RAM from key to offset; the log becomes the WAL |
| 6 | [Compacting one huge log](docs/notes/06-single-log-compaction.md) | The log grows forever | Remove stale records in place, which blocks writes and shifts offsets |
| 7 | [Many small log segments](docs/notes/07-log-segments.md) | Compaction fights with writes | Only the active segment takes writes; closed ones can be compacted |
| 8 | [The memtable](docs/notes/08-memtable.md) | Every read hits the disk | Keep the active segment's newest values in RAM |
| 9 | [Deferring the offset map](docs/notes/09-deferred-offset-map.md) | Three writes per put | Update the map once, in bulk, when a segment closes |
| 10 | [Flushing to SSTables](docs/notes/10-sstable-flush.md) | Closed segments keep duplicates | Write the memtable's sorted, deduplicated view; keep it as a cache |
| 11 | [Merge compaction](docs/notes/11-merge-compaction.md) | Duplicates across tables | Merge sorted tables like merge sort; newer wins |
| 12 | [Dropping the offsets](docs/notes/12-binary-search-tables.md) | One RAM entry per key won't scale | Binary-search sorted tables, newest first |
| 13 | [The sparse index](docs/notes/13-sparse-index.md) | Binary search touches many blocks | One index entry per block; read exactly one block |
| 14 | [Deletes and tombstones](docs/notes/14-tombstones.md) | Immutable files can't forget a key | Write a marker that hides older values |
| 15 | [Bloom filters](docs/notes/15-bloom-filters.md) | Absent keys still cost a read per table | Rule them out from RAM |
| 16 | [The complete LSM tree](docs/notes/16-complete-lsm.md) | Putting it all together | The full write, read, flush, compaction and recovery paths |

## How the complete system works

```
            put / delete                         get
                 │                                 │
                 ▼                                 ▼
   ┌──────── RAM ────────────────────────────────────────────┐
   │  Memtable  (dirty: only in WAL │ clean: cached copy)    │
   │  Per table: Bloom filter + sparse index (loaded once)   │
   └─────────────────────────────────────────────────────────┘
        │ append first                    │ miss: newest → oldest
        ▼                                 ▼
   ┌──────── Disk ───────────────────────────────────────────┐
   │  wal-000007.log (active)                                │
   │  sst-000006-000006.sst  [blocks][sparse index][bloom]   │
   │  sst-000001-000005.sst  [blocks][sparse index][bloom]   │
   └─────────────────────────────────────────────────────────┘
        flush: dirty → sorted SSTable     compaction: merge oldest pair
```

**Write**, for `put(key, value)` or `delete(key)`:
1. Append a record to the active WAL and fsync it. From here on, a crash can't lose the write.
2. Store the key in the memtable as **dirty**. If the key is new and the memtable is full, evict one clean entry first.
3. If the WAL has reached its size limit, or every memtable slot is dirty, flush.

**Read**, for `get(key)`:
1. If the memtable has the key (dirty or clean), it holds the newest value. Return it, or "not found" for a tombstone.
2. Otherwise check each SSTable, **newest to oldest**:
   1. The Bloom filter says "definitely not": skip the table, with no disk read.
   2. The sparse index picks the one block that could hold the key.
   3. Read that block from disk and binary-search it.
   4. Found: cache it in the memtable as clean and return it. Not found (a false positive): move to the next table.
3. No table has it: "not found".

**Flush:**
1. Sort the dirty entries by key.
2. Write `sst-N-N.sst` to a temporary file, fsync it, rename it, then fsync the directory.
3. Mark the entries clean, open the next WAL, and delete the old one.
4. Compact if needed.

**Compaction:** when the number of tables reaches the trigger, merge the two oldest. On equal keys the newer entry wins. Tombstones are dropped too, because nothing older remains. The output is written as `sst-MIN-MAX.sst` and the inputs are deleted.

**Recovery:**
1. Delete `*.tmp` files.
2. Delete any table whose range lies inside another table's range.
3. Open the remaining tables.
4. Delete WALs that a table already covers.
5. Replay the remaining WAL until a record is incomplete or fails its CRC check, truncate there, and rebuild the dirty entries in the memtable.

## Project layout

```
.
├── README.md                    you are here
├── docs/
│   └── notes/                   revision notes: one per stage, glossary, cheat sheet
├── codebases/
│   ├── java/                    src/lsm/… engine, src/demo/… narrated demo
│   ├── python/                  lsm/… engine, demo/… narrated demo
│   ├── javascript/              lsm/… engine (the reference port), demo/…
│   └── cpp/                     lsm/… engine, demo/…
└── visualizer/
    ├── app/  pages/  layouts/   routing and page structure
    ├── components/              machine view, visuals, walkthrough player, code panels
    ├── engine/                  the simulation that produces every walkthrough step
    └── content/                 stage text, snippets, the whole-database file, codebase index
```

- [Revision notes](docs/notes/README.md): start with the [index](docs/notes/README.md), the [glossary](docs/notes/glossary.md) and the [cheat sheet](docs/notes/cheatsheet.md).
- Each engine has its own README with a file-by-file map: [Java](codebases/java/README.md), [Python](codebases/python/README.md), [JavaScript](codebases/javascript/README.md), [C++](codebases/cpp/README.md).
- The single-class overview of the whole database, in each language: [Java](visualizer/content/whole-database/MyDatabase.java), [Python](visualizer/content/whole-database/my_database.py), [JavaScript](visualizer/content/whole-database/myDatabase.js), [C++](visualizer/content/whole-database/my_database.cpp).

## Getting started

### Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 22 or newer (npm 10) | the visualizer and the JavaScript engine |
| Python | 3.12 or newer | the Python engine |
| JDK | 17 or newer | the Java engine |
| g++ | with C++17 support (13 or newer recommended) | the C++ engine |

None of the engines has any third-party dependencies.

### Run the visualizer

1. Install the dependencies:
   ```bash
   cd visualizer
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open the address it prints (usually `http://localhost:5173`).
4. Start with **Start with the requirements**, step through each walkthrough with **Next step** or the arrow keys, and use **Code** in the header to browse the engines.

To build a static version instead, run `npm run build`. The output goes to `visualizer/dist/`, and `npm run preview` serves it.

### Run an engine's demo

Each demo wipes and recreates a `data/` folder inside its own language folder, then walks through ten chapters: writes, values changing type, flushes, cache hits, evictions, disk reads through Bloom filters, a delete, compaction, and a simulated crash with recovery.

**JavaScript**
```bash
cd codebases/javascript
node demo/main.js
```

**Python**
```bash
cd codebases/python
python3 -m demo.main
```

**Java**
```bash
cd codebases/java
rm -rf out && javac --release 17 -d out $(find src -name '*.java')
java -cp out demo.Main
```

**C++**
```bash
cd codebases/cpp
mkdir -p build
g++ -std=c++17 -O2 -Wall -Wextra -Wpedantic -I. $(find lsm demo -name '*.cpp') -o build/lsm_demo
./build/lsm_demo
```

All four demos print exactly the same output, and leave byte-identical files in their `data/` folders. A table written by one language can be read by any other.

## Reading the demo output

Each chapter has three kinds of output:
- a short explanation;
- the operations (`> put macbook = "Apple"`, `> get watch`);
- the engine's own log.

Every log line has the same shape:

```
[LEVEL] [Component  ] message  key=value key=value
[DEBUG] [Read       ] bloom filter says definitely absent, table skipped  key=nokia table=sst-000002-000002.sst
[INFO ] [Compaction ] merged  output=sst-000001-000003.sst kept=8 duplicatesDropped=6 tombstonesDropped=1
[WARN ] [Recovery   ] torn WAL tail truncated  wal=wal-000005.log keptBytes=58 droppedBytes=5
```

- `DEBUG` shows each internal step: appends, memtable updates, evictions, Bloom filter checks, block reads.
- `INFO` shows lifecycle events: WAL opened or deleted, flush, SSTable written, compaction, recovery.
- `WARN` shows something recovery had to repair.

After key steps, the demo prints a **snapshot**:
- the active WAL and its size;
- every memtable entry with its state, `dirty` or `clean`;
- every SSTable, newest first, with its blocks and how many Bloom filter bits are set.

## Experiments

The demo's limits are deliberately tiny so that everything happens within a few writes. They live in one place per language:
- [`storeConfig.js`](codebases/javascript/lsm/config/storeConfig.js) (`DEMO_CONFIG`)
- [`store_config.py`](codebases/python/lsm/config/store_config.py) (`DEMO_CONFIG`)
- [`StoreConfig.java`](codebases/java/src/lsm/config/StoreConfig.java) (`DEMO_CONFIG`)
- [`store_config.h`](codebases/cpp/lsm/config/store_config.h) (`kDemoConfig`)

Change one value, rerun the demo, and watch what changes:

| Change | What to look for |
|---|---|
| `walMaxBytes` from 128 to 60 | Flushes happen after every two writes; more, smaller tables; compaction runs much earlier. |
| `memtableCapacity` from 6 to 3 | More `evicted clean entry` lines, more reads that reach the disk, and flushes forced by `memtable full of dirty entries`. |
| `evictionPolicy` from `lru` to `lfu` or `fifo` | Different victims in chapter 6, and different reads hitting the cache in chapter 7. |
| `compactionTrigger` from 3 to 2 | A merge after every flush; the oldest table keeps growing and the table count stays tiny. |
| `bloomBitsPerKey` from 6 to 2 | Many more `bloom filter false positive` lines: each one is a wasted block read. |
| `blockSizeBytes` from 64 to 32 | More blocks per table and a longer sparse index, but each read touches fewer bytes. |

The demo's narration is written for the default values. After a change, some sentences, such as the one predicting the false positive in chapter 7, may no longer describe what happens; the log lines always do.

## Design choices worth knowing

- **The memtable is also a cache.** Entries stay in RAM after a flush and are marked clean. Recently read keys are cached as clean too. Only clean entries are ever evicted, and a memtable full of dirty entries forces an early flush. Many production engines keep the memtable and the read cache as two separate structures; this design combines them safely through the dirty/clean state.
- **Tombstones are their own entry type**, not a special value such as `null`, so `null` can still be stored. A tombstone is dropped only when the merge includes the oldest table.
- **Tables are named by the range they cover** (`sst-000001-000003.sst`), not by a fresh number. That keeps the newest-to-oldest read order correct after merges.
- **Every WAL record has a CRC-32 checksum**, so recovery can tell a complete record from one torn by a crash.
- **Durability is strict but simple.** Every write is fsynced, and every table is written to a temporary file and then renamed. Production engines usually batch fsyncs (group commit) and stream compaction instead of loading whole tables. Each such simplification is marked with a `NOTE:` comment in the code.
- **Concurrency is out of scope.** Compaction runs inline after a flush. In a production engine it would run on background threads.
- **Partitioning and replication across machines are explained but not built.** Small immutable SSTables are what make them straightforward.
