# Stage 16: The complete LSM tree

All the pieces together. This structure is called a **log-structured merge tree (LSM tree)**:
- *log-structured* because every write is an append to a log;
- *merge* because sorted files are merged in the background;
- *tree* because those merges build larger tables out of smaller ones, level by level.

LSM trees are the storage engine behind databases such as Cassandra, ScyllaDB, RocksDB, LevelDB and Bigtable.

## The whole system

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

## Components

| Component | Lives in | Job |
|---|---|---|
| Write-ahead log (WAL) | Disk | Makes every write durable before anything else happens; replayed after a crash |
| Memtable | RAM | Newest value of recently written keys (dirty) plus a cache of recently read keys (clean) |
| Eviction policy | Logic | Drops clean entries when the memtable is full; never dirty ones |
| SSTables | Disk | Immutable, sorted, one entry per key, named by the sequence range they cover |
| Data blocks | Disk | An SSTable's entries in small chunks; one block read per lookup |
| Sparse index | RAM (per table) | First key and offset of each block |
| Bloom filter | RAM (per table) | "Definitely not here" checks with no disk read |
| Compactor | Logic | Merges the two oldest tables, newer wins, drops tombstones when safe |
| Recovery manager | Logic | Cleans up and rebuilds state on startup |

## How the operations work

### Write: put(key, value)

1. **Disk:** append a record to the active WAL and **fsync** it, which forces the bytes onto the physical disk. Once this returns, the write survives a crash.
2. **RAM:** upsert the key into the memtable as **dirty**. If the key is new and the memtable is full, first evict one clean entry.
3. If the WAL has reached its size limit, or the memtable is full of dirty entries, **flush**.

### Delete: delete(key)

Exactly like a put, but the record is a **tombstone**.

### Read: get(key)

1. **Memtable.** If the key is present (dirty or clean), it is the newest value: return it, or return not found for a tombstone. No disk access.
2. **Otherwise**, for each SSTable from **newest to oldest**:
   1. **Bloom filter:** "definitely not" means skip the table.
   2. **Sparse index:** choose the single block that could hold the key.
   3. **Disk:** read that one block.
   4. **Binary search** inside the block. If not found (a false positive), continue to the next table.
   5. If found, store it in the memtable as **clean** (the cache), and return the value, or not found for a tombstone.
3. If no table has it, return **not found**.

### Flush

1. Collect the dirty entries and sort them by key.
2. Write them as an SSTable: blocks, then the sparse index, then the Bloom filter, then a footer. Write to a temporary file, fsync it, rename it, then fsync the directory.
3. Mark the entries clean, start a new WAL, and delete the old one.
4. Run compaction if the number of tables has reached the trigger.

### Compaction

1. When the number of tables reaches the trigger, take the two oldest.
2. Merge with two pointers; on equal keys keep the newer entry. If the older input is the oldest table on disk, drop tombstones as well.
3. Write the output named by the combined range, for example `sst-000001-000003.sst`, then delete the inputs.
4. Repeat until the table count is below the trigger.

### Recovery after a crash

1. Delete any `*.tmp` files. They are unfinished flushes or merges.
2. Delete any table whose range lies inside another table's range. It is a leftover input of a merge that finished writing its output.
3. Open the remaining tables, loading each one's sparse index and Bloom filter.
4. Delete any WAL whose sequence number is already covered by a table. It was flushed before the crash.
5. Replay the remaining WAL records into the memtable as dirty. Each record carries a **checksum** (CRC-32). If the last record is incomplete or its checksum doesn't match, it was a **torn write**, interrupted mid-append. Truncate the WAL there and log a warning. That write was never acknowledged, so nothing acknowledged is lost.
6. Continue appending to the recovered WAL.

## The byte formats used by the engines

All four engines in `codebases/` write identical bytes (big-endian):

```
Entry      u16 key length | key (UTF-8) | u8 value type | u32 value length | value bytes
           value types: 0 null, 1 boolean, 2 number (8-byte double), 3 string, 4 tombstone

WAL        repeated: u32 CRC-32 of payload | u32 payload length | payload (an Entry)

SSTable    data blocks | sparse index | Bloom filter | 16-byte footer
           footer: u32 index offset | u32 bloom offset | u32 entry count | u32 magic "LSM1"
```

Example: the entry `macbook = "Apple"` is 19 bytes:

```
00 07                  key length 7
6d 61 63 62 6f 6f 6b   "macbook"
03                     type: string
00 00 00 05            value length 5
41 70 70 6c 65         "Apple"
```

In the WAL, it is preceded by its checksum `e6 23 80 88` and its length `00 00 00 13` (19).

## How each requirement is met

| Requirement | How |
|---|---|
| Fast writes | One sequential WAL append plus one RAM update. Flushing and compaction happen later, in bulk, without blocking writes |
| Fast reads | Recent and popular keys come from the memtable. Otherwise, per table: a Bloom filter check, a sparse index lookup and at most one block read |
| Durability | The WAL is fsynced before a write is acknowledged; SSTables are written atomically; recovery handles torn writes and interrupted flushes or merges |
| Unstructured values | Every value carries its own type and length; nothing about the schema is fixed |
| A few petabytes | Data lives in immutable SSTables that can be placed on and copied to many machines; RAM use per table is a few bits per key plus one index entry per block |

## Notes

> **Note:** fsyncing after every write is the safest choice but limits throughput. Production systems often **group-commit**: they batch several writes into one fsync.

> **Note:** production engines usually organise tables into **levels** (leveled compaction) or by size (size-tiered compaction). The "merge the two oldest" strategy here is the simplest form of the same idea.

## Revise

<details><summary>Describe the full write path.</summary>

Append to the WAL and fsync it, upsert the key into the memtable as dirty (evicting a clean entry if needed), and flush if the WAL or the memtable is full.
</details>

<details><summary>Describe the full read path for a key that is not in the memtable.</summary>

For each table, newest to oldest: check the Bloom filter, use the sparse index to pick a block, read the block, binary search inside it. Return on the first match and cache it as clean.
</details>

<details><summary>What does the WAL checksum protect against?</summary>

A torn write: a record half-written when the crash happened. Recovery detects it, truncates it and continues.
</details>

<details><summary>Why can recovery delete a WAL whose sequence number is covered by an SSTable?</summary>

That WAL was already flushed into the table before the crash, so its contents are safely on disk.
</details>

<details><summary>Where does each of the five requirements get satisfied?</summary>

Writes: WAL append plus memtable. Reads: memtable, Bloom filters, sparse index, one block. Durability: fsynced WAL, atomic SSTable writes, recovery. Unstructured: typed, length-prefixed values. Scale: immutable SSTables spread across machines, with small per-table RAM structures.
</details>

<details><summary>Why are SSTables written to a temporary file and then renamed?</summary>

A rename is atomic, so a crash leaves either the complete table under its final name or only a temporary file that recovery deletes. Never a half-written table.
</details>
