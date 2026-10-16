# Stage 9: Deferring the offset map

Remove the redundant third write from every put.

## The problem

Each put writes to the WAL, the memtable *and* the offset map, but offset-map entries for the active segment are never used: the memtable answers those reads.

## The change

- A put writes only to the **active segment** and the **memtable**.
- The offset map learns about a segment **once, in bulk, when the segment closes**.

## Components

| Component | Lives in | Job |
|---|---|---|
| Active segment | Disk | Durability |
| Memtable | RAM | Serves reads for the active segment |
| Offset map | RAM | Covers closed segments only, updated in bulk |

## How the operations work

### Put kindle = "Paperwhite"

1. **Disk:** append to the active segment.
2. **RAM:** set `memtable[kindle] = "Paperwhite"`.

That's **two writes**. The offset map is untouched.

### Read

1. Check the memtable. If the key is there, it's the newest value: return it.
2. Otherwise use the offset map, which covers all closed segments, then read from disk.

### The segment closes

When the active segment is full:

1. Create the next segment and make it active.
2. For every record in the segment that just closed, write its `(segment, offset)` into the offset map in a **single bulk update**.

One batched update when a segment closes replaces many small updates spread across every put.

## Trade-offs

| Gains | Costs |
|---|---|
| Two writes per put instead of three | The bulk update happens all at once at roll-over |
| The offset map is touched once per segment, not once per write | Closed segments still contain duplicates |
| | Data on disk is still in arrival order, not sorted |
| | The offset map still has one entry per key |

## Why the next stage

At the moment a segment closes, the memtable already holds a **clean, duplicate-free** version of it. Instead of keeping the raw segment with its stale records, why not write *that* version to disk, sorted by key? That is the SSTable.

## Revise

<details><summary>Why is updating the offset map on every put unnecessary?</summary>

Reads for keys in the active segment are answered by the memtable, so their offset-map entries are never used until the segment closes.
</details>

<details><summary>When does the offset map learn about a segment's keys?</summary>

In one bulk update, when the segment closes and a new one becomes active.
</details>

<details><summary>How many writes does a put do now?</summary>

Two: the active segment on disk and the memtable in RAM.
</details>

<details><summary>Does deferring the offset map make reads of fresh keys slower?</summary>

No. Fresh keys are in the active segment, and the memtable answers those reads directly.
</details>

<details><summary>What does the memtable already contain at the moment a segment closes, and why does that matter?</summary>

A duplicate-free copy of that segment's data with the newest value per key. It is the cleaner version that the next stage writes to disk as an SSTable.
</details>
