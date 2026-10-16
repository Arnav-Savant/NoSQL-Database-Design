# Stage 8: The memtable

Keep an in-memory copy of the active segment so that the freshest data can be read without touching the disk.

## The problem

Every read hits the disk, and the disk is shared with compaction.

## The change

Add a **memtable**: a hash map in RAM holding the contents of the active segment.

- The active segment may contain several records for the same key. The memtable keeps **one entry per key**, always the **latest** value, because putting a key into a hash map replaces the old value.
- Every write now goes to **both** the active segment (for durability) and the memtable (for fast reads).
- Anything found in the memtable is guaranteed to be the newest value, because the active segment always holds the newest writes.

## Components

| Component | Lives in | Job |
|---|---|---|
| Active segment | Disk | Durability: the write survives a crash |
| Memtable | RAM | Fresh data, one entry per key, newest value |
| Offset map | RAM | `key → (segment, offset)` for everything on disk |
| Closed segments | Disk | Older data |

## How the operations work

Continue from stage 7. The active segment is `wal-000004.log`, which holds `macbook:"Apple"`.

### Put iphone12 = 4.9

1. **Disk:** append `iphone12:4.9` to `wal-000004.log` at offset 16.
2. **RAM:** set `memtable[iphone12] = 4.9`.
3. **RAM:** set `offsetMap[iphone12] = (4, 16)`.

That is **three writes**: one to disk and two to RAM.

### Read iphone12 (memtable hit)

1. **RAM:** `memtable[iphone12]` exists, so return 4.9. No disk access at all.

### Read airpods (memtable miss)

1. **RAM:** airpods is not in the memtable.
2. **RAM:** offset map gives `(2, 9)`.
3. **Disk:** read `wal-000002.log` at 9 and return 4.5.

If, say, 4 out of 10 reads find their key in the memtable, those 4 never touch the disk. The share of reads answered from memory is the **hit ratio**.

### Restart

1. Both the memtable and the offset map are lost: they were in RAM.
2. Rebuild the memtable by replaying the active segment.
3. Rebuild the offset map by scanning all segments.

## Trade-offs

| Gains | Costs |
|---|---|
| Reads of fresh keys are served from RAM | Each put now does three writes |
| The memtable never holds duplicates | More RAM in use |
| Reads interfere less with compaction | Restart rebuilds two structures |

## Why the next stage

Look at the third write. The offset map entry for the active segment is never needed: any read for a key in the active segment is already answered by the memtable. The next stage drops that redundant work.

## Revise

<details><summary>What is a memtable?</summary>

An in-RAM hash map holding the active segment's data, with one entry per key, always the newest value.
</details>

<details><summary>Why is a value found in the memtable always the latest?</summary>

The memtable mirrors the active segment, which receives every new write, so nothing newer exists anywhere else.
</details>

<details><summary>Why write to both the WAL and the memtable?</summary>

The WAL makes the write durable; the memtable makes it fast to read.
</details>

<details><summary>How many writes does a put do here, and where?</summary>

Three: the WAL on disk, the memtable in RAM, and the offset map in RAM.
</details>

<details><summary>What is the hit ratio?</summary>

The fraction of reads answered from the memtable without touching the disk.
</details>
