# Stage 10: Flushing to SSTables

When the active WAL fills up, write the memtable's clean, duplicate-free view of it to disk, **sorted by key**. That file is an SSTable. The memtable stays in RAM and doubles as a cache.

## The problem

Closed segments keep their stale records and their arrival order. Meanwhile the memtable already holds a deduplicated version of the same data.

## The change

**Sorted String Table (SSTable).** An SSTable is an immutable file containing **one entry per key, sorted by key**.
- *Sorted* makes searching it efficient.
- *One entry per key* means it holds no duplicates.
- *Immutable* means it is written once and never modified.

**Flush.** When the active WAL is full:
1. Take the memtable entries written since the last flush.
2. Sort them by key and write them as a new SSTable.
3. Discard the WAL. Its data is now safely in the SSTable.

**Dirty and clean entries.** The memtable is not emptied after a flush. It keeps the entries as a cache, and tracks each entry's state:

| State | Meaning | Can be evicted? |
|---|---|---|
| **Dirty** | Written since the last flush; it exists only in the active WAL | **Never.** Evicting it would hide the newest value from every read |
| **Clean** | Already saved in an SSTable | Yes, by the eviction policy |

**Capacity and eviction.** RAM is limited, so the memtable has a capacity. When it is full and needs room, an **eviction policy** chooses a **clean** entry to remove:
- **LRU:** least recently used. This is the default.
- **LFU:** least frequently used.
- **FIFO:** first in, first out.

Evicted entries are still on disk in an SSTable, so nothing is lost; the next read for that key just goes to disk.

The examples from here use a WAL that is "full" after **5 records** and a memtable with a capacity of **6 entries**.

## Components

| Component | Lives in | Job |
|---|---|---|
| Active WAL | Disk | Durability for dirty entries |
| Memtable | RAM | Dirty entries (pending flush) plus clean entries (cache) |
| Eviction policy | Logic | Picks which clean entry to drop when the memtable is full |
| SSTables | Disk | Immutable, sorted, one entry per key |
| Offset map | RAM | Still `key → (table, offset)` for data on disk |

## How the operations work

### Flush the first WAL

`wal-000001.log` receives five writes:

```
iphone11=4.8   iphone12=4.7   macbook=4.9   ipad=4.6   macbook="Apple"
```

The memtable holds four dirty entries, because macbook was overwritten in RAM. The WAL is now full:

1. **Collect** the dirty entries: iphone11, iphone12, ipad, macbook.
2. **Sort** them by key. In byte order `ipad` comes before `iphone11`, because `a` < `h`:

   ```
   ipad=4.6   iphone11=4.8   iphone12=4.7   macbook="Apple"
   ```

3. **Write** them to `sst-000001-000001.sst`. The name records which WAL sequence numbers the table covers, here 1 to 1. The file is written under a temporary name, synced to disk, then renamed, so a crash never leaves a half-written table under the real name.
4. **Mark** those four entries clean. They stay in RAM.
5. **Start** `wal-000002.log` as the new active WAL.
6. **Delete** `wal-000001.log`. Everything in it is now in the SSTable, and the stale `macbook=4.9` is gone.
7. **Update** the offset map with the new table's offsets.

```
Memtable after flush (LRU order, least recent first)
iphone11=4.8 clean | iphone12=4.7 clean | ipad=4.6 clean | macbook="Apple" clean
```

### Eviction skips dirty entries

`wal-000002.log` receives `airpods=4.5`, `watch=4.4`, `pixel8=4.3`, `iphone12=4.9`, `airpods=true`.

1. `airpods` and `watch` are new and dirty. The memtable now holds 6 entries, which is full.
2. `pixel8` is new, but there's no room. LRU looks for the least recently used **clean** entry, which is `iphone11`. It is evicted from RAM, but it is still in `sst-000001-000001.sst`. `pixel8` is stored as dirty.
3. `iphone12=4.9` overwrites the existing clean entry, which becomes dirty again. No room is needed.
4. `airpods=true` overwrites a dirty entry. The type changed from a number to a boolean; that's fine.
5. The WAL is full, so flush. The dirty entries `airpods=true, iphone12=4.9, pixel8=4.3, watch=4.4` become `sst-000002-000002.sst`.

### A read fills the cache

Read `iphone11`, which was evicted earlier:

1. **RAM:** memtable miss.
2. **RAM:** the offset map points to `(sst-000001-000001, offset of iphone11)`.
3. **Disk:** read `iphone11=4.8` from that table.
4. **RAM:** store it in the memtable as **clean**. The memtable is full, so LRU evicts the least recently used clean entry, `ipad`.

A later read of `iphone11` is now a memtable hit.

### Duplicates across tables

```
sst-000001-000001:  ipad=4.6  iphone11=4.8  iphone12=4.7  macbook="Apple"
sst-000002-000002:  airpods=true  iphone12=4.9  pixel8=4.3  watch=4.4
```

Each table is duplicate-free on its own, but `iphone12` appears in both. The newer table holds the current value.

### When the memtable fills with dirty entries

Dirty entries can't be evicted. If every slot is dirty, the store **flushes early**, even if the WAL isn't full yet. That turns them clean and makes eviction possible again.

### Restart

Replay the active WAL to rebuild the dirty entries. Clean entries are lost, but they were only a cache: their data is in SSTables, and they come back as keys are read.

## Trade-offs

| Gains | Costs |
|---|---|
| One duplicate-free, sorted file per WAL instead of a raw log | Duplicates still exist **across** tables |
| Old WAL files are deleted after each flush | The offset map still needs one entry per key |
| The memtable acts as a cache with a good hit ratio | Dirty entries pin memory until the next flush |
| Small immutable files are easy to copy to other machines | |

## Notes

> **Note:** a dirty entry lives only in the WAL until it is flushed. If eviction removed it, the next read would miss the memtable and find an **older** value on disk, or nothing. This is not a rare corner case: in a write-heavy workload, LRU would *prefer* to evict keys that were written once and never read, which are exactly the dirty ones. Restricting eviction to clean entries removes the problem completely.

> **Note:** a clean entry can never be out of date. Every write goes through the memtable and replaces the entry for that key, so whatever the memtable holds is the newest value.

> **Note:** many production engines keep the memtable (pending writes) and the read cache as two separate structures. Combining them, with an explicit dirty/clean state, achieves the same safety in one structure.

> **Aside:** because SSTables are small and never modified, they can be copied to other machines in the background (**replication**) and placed on different machines (**partitioning**). This is how the design starts to reach petabyte scale.

## Why the next stage

Duplicates across tables still waste space, and the number of tables keeps growing. Since every table is already sorted, two tables can be combined efficiently, keeping only the newest version of each key.

## Revise

<details><summary>What do the letters in SSTable stand for, and what does each property buy?</summary>

Sorted String Table. Sorted makes searching efficient; one entry per key means no duplicates inside a table; and the file is immutable, so it is never modified after writing.
</details>

<details><summary>List the flush steps in order.</summary>

Collect the dirty entries, sort them, write the SSTable (temporary name, sync, rename), mark the entries clean, start a new WAL, delete the old WAL, and update the offset map.
</details>

<details><summary>Why can't a dirty entry be evicted?</summary>

It hasn't been flushed: its newest value exists only in the WAL. Evicting it would make reads return an older value from an SSTable, or nothing.
</details>

<details><summary>What happens if the memtable is full and every entry is dirty?</summary>

The store flushes early, which makes the entries clean and evictable.
</details>

<details><summary>In the example, why was iphone11 evicted, and was any data lost?</summary>

It was the least recently used clean entry. No data was lost: iphone11 is still in sst-000001-000001.
</details>

<details><summary>Why is ipad sorted before iphone11?</summary>

Keys are compared byte by byte: "ip" matches, then "a" (0x61) is less than "h" (0x68).
</details>

<details><summary>What does the memtable contain after a restart?</summary>

Only the dirty entries, rebuilt from the active WAL. The cache part starts empty and refills as keys are read.
</details>
