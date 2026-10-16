# Stage 14: Deletes and tombstones

SSTables are immutable, so a delete can't remove anything from them. Instead, a delete writes a special entry, a **tombstone**, that says "this key is deleted".

## The problem

The key might live in several SSTables, which can't be edited. Removing it from the memtable alone would let a read fall through to an older table and find the old value.

## The change

- `delete(key)` is a write: append a **tombstone** for the key to the WAL, and store it in the memtable as a dirty entry.
- A tombstone is a **separate entry type**, not a value such as `null`, so `null` can still be stored as a real value.
- A read that finds a tombstone, in the memtable or in a table, stops and returns **not found**. Because tables are checked newest first, the tombstone hides every older value.
- Compaction eventually removes the key, and the tombstone itself, when it is safe to do so.

## Components

| Component | Lives in | Job |
|---|---|---|
| Tombstone | WAL, memtable, SSTables | Marks a key as deleted at a point in time |
| Compactor | Logic | Drops a tombstone once no older data can contain the key |

## How the operations work

Current tables: `sst-000001-000002` (contains `watch=4.4`) and `sst-000003-000003`.

### Delete watch

1. **Disk:** append a tombstone record for `watch` to the active WAL.
2. **RAM:** set `memtable[watch] = tombstone (dirty)`.

### Read watch

1. **RAM:** the memtable holds a tombstone, so return **not found**. The `watch=4.4` in sst-1-2 is never consulted.

Later, the WAL flushes into `sst-000004-000004`, which contains `watch=tombstone`. A read with an empty memtable checks sst-4 first, finds the tombstone and returns not found.

### Compaction case A: the merge includes the oldest table

The merge combines `sst-000001-000003` (the oldest data on disk, with `watch=4.4`) and `sst-000004-000004` (with `watch=tombstone`).

1. The keys are equal, so the newer entry, the tombstone, wins.
2. This merge covers **all** data older than the tombstone, so no other table can hold an older `watch`.
3. **Drop the tombstone too.** `watch` disappears completely.

### Compaction case B: the merge does not include the oldest table

The tables are `sst-1-2` (`watch=4.4`), `sst-3` and `sst-4` (`watch=tombstone`), and a strategy merges only `sst-3` and `sst-4`.

- If the tombstone were dropped, the merged `sst-3-4` would have no entry for watch. A read would fall through to `sst-1-2` and find `watch=4.4`: **the deleted key comes back**.
- So the tombstone **must be kept** until a merge also includes the oldest table.

## Trade-offs

| Gains | Costs |
|---|---|
| Deletes are as cheap as writes: one append | Tombstones take space until compaction removes them |
| Works with immutable tables | Deleted keys still cost a lookup until the tombstone is found |

## Notes

> **Note:** the rule is "drop a tombstone only when no older table could still contain the key". The engines in `codebases/` merge the two oldest tables, so a tombstone is dropped as soon as it reaches a merge with the oldest table.

> **Note:** using `null` as the delete marker would make it impossible to store a real `null` value. A distinct entry type avoids that ambiguity.

## Why the next stage

Reads for missing keys, including deleted ones, are still expensive: in the worst case they read one block from every table. The next stage skips most of those reads.

## Revise

<details><summary>What is a tombstone?</summary>

A special entry written by a delete that marks the key as deleted. It is a distinct entry type, not a value.
</details>

<details><summary>Why can't a delete just remove the key from the SSTable?</summary>

SSTables are immutable. And even if the memtable entry were removed, a read would fall through to an older table and find the old value.
</details>

<details><summary>When can compaction drop a tombstone?</summary>

When the merge includes the oldest table, so that no older data anywhere could still contain the key.
</details>

<details><summary>What goes wrong if a tombstone is dropped too early?</summary>

The deleted key comes back: a read skips past the newer tables and finds the old value in an older table.
</details>

<details><summary>Why not use null as the delete marker?</summary>

Then null could never be stored as a real value.
</details>
