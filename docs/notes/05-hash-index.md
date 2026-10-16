# Stage 5: An in-memory hash index

Keep the append-only file for writes, and add a hash map in RAM that remembers **where** each key's latest record is.

## The problem

Append-only writes are fast, but reads scan the whole file.

## The change

Keep an **offset map** in RAM: `key → byte offset of the latest record for that key`. An **offset** is a position in the file, counted in bytes from the start.

The append-only file now has its proper name: the **write-ahead log (WAL)**. Data is written to this log first, before anything else, and only ever appended.

## Components

| Component | Lives in | Job |
|---|---|---|
| Write-ahead log (WAL) | Disk | Append-only file holding every write, in order |
| Offset map | RAM | Hash map from key to the offset of its latest record |

## How the operations work

Starting state:

```
WAL on disk                          Offset map in RAM
offset 0   iphone11:4.8              iphone11 → 0
offset 13  iphone12:4.7              iphone12 → 13
offset 26  macbook:4.9               macbook  → 26
offset 38  ipad:4.6                  ipad     → 38
offset 47  (end)
```

### Put pixel8 = 4.3 (a new key)

1. **Disk:** append `pixel8:4.3` at offset 47 (11 bytes, so the file ends at 58).
2. **RAM:** set `pixel8 → 47`.

### Update macbook to "Apple"

1. **Disk:** append `macbook:"Apple"` at offset 58 (16 bytes, so the file ends at 74).
2. **RAM:** change `macbook → 26` to `macbook → 58`.

The record at 26 still exists, but no map entry points to it any more.

### Read iphone12

1. **RAM:** look up `iphone12` in the hash map. This is O(1) on average: it returns 13.
2. **Disk:** one seek to offset 13 and read the record: 4.7.

One random read of one record replaces a sequential scan of the whole file. With a million records, that's the difference between reading one record and reading all of them.

### Crash and rebuild

1. Power is lost. The offset map was in RAM, so it is gone. The WAL is on disk, so it survives.
2. On restart, scan the WAL from the beginning. For each record, set `map[key] = offset`. Later records overwrite earlier ones, so each key ends up pointing at its latest version.
3. The map is fully rebuilt. Nothing was lost, because every acknowledged write was in the WAL.

## Trade-offs

| Gains | Costs |
|---|---|
| Reads: one hash lookup plus one disk read | The WAL still grows forever with stale records |
| Writes: one append plus one RAM update | The map needs one RAM entry per key, and billions of keys won't fit |
| Durable: the WAL is the source of truth | Everything lives on one machine, with no way to split it |
| Values of any type and size | Rebuilding after a crash takes longer as the WAL grows |

## Notes

> **Note:** "RAM is faster than disk" is an understatement. A RAM access is around 100 nanoseconds; a random seek on a spinning disk is around 10 milliseconds, about 100,000 times slower. That gap is why keeping lookups in RAM and doing only one disk read per lookup matters so much.

> **Aside: relational databases also use a WAL.** Before changing data pages or indexes such as B+ trees, a relational database writes the change to a sequential log. If it crashes, it replays the log, so the slower, scattered page updates can be done later and in batches. MySQL also has a separate *change buffer* that batches updates to secondary indexes. The idea is the same as here: log sequentially first, organise later.

## Why the next stage

The biggest remaining problem is the **ever-growing WAL**. Updating one key a thousand times leaves 999 stale records. The obvious fix is to periodically remove stale records (**compaction**). The next stage tries doing that on this single file.

## Revise

<details><summary>What does the offset map store, and where does it live?</summary>

For each key, the byte offset of its latest record in the WAL. It lives in RAM.
</details>

<details><summary>Walk through an update of macbook to "Apple".</summary>

Append the new record at the end of the WAL (offset 58), then point the map entry for macbook at 58. The old record at 26 stays but is no longer referenced.
</details>

<details><summary>Why write to disk at all if RAM is faster?</summary>

Durability (RAM is lost on power failure) and capacity (petabytes won't fit in RAM).
</details>

<details><summary>How is the offset map recovered after a crash?</summary>

By scanning the WAL from the start and setting map[key] = offset for each record; later records overwrite earlier ones.
</details>

<details><summary>List the four problems this design still has.</summary>

Ever-growing WAL, one RAM entry per key, a single machine, and recovery time that grows with the WAL.
</details>

<details><summary>Why is one random read better than a sequential scan here, if disks prefer sequential access?</summary>

The scan reads the entire file; the random read touches one record. Sequential is cheaper per byte, but reading a million records sequentially still costs far more than one seek.
</details>
