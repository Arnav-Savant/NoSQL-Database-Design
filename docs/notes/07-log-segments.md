# Stage 7: Many small log segments

Instead of one enormous WAL, keep many small ones, called **segments**. Only the newest receives writes.

## The problem

Compacting a single live log blocks writes, rewrites the offset map, and must be done in chunks anyway.

## The change

- The WAL is split into numbered **segments**: `wal-000001.log`, `wal-000002.log`, and so on.
- Each segment has a **size limit**. Real systems use tens of megabytes; this example uses 40 bytes so the files stay small.
- Only the newest segment, the **active** segment, accepts writes. When the next record wouldn't fit, a new segment is created and becomes active. Older segments are **closed**: read-only and never written again.
- The offset map now stores **which segment and which offset**: `key → (segment, offset)`.

## Components

| Component | Lives in | Job |
|---|---|---|
| Active segment | Disk | Receives every new append |
| Closed segments | Disk | Read-only; safe to compact |
| Offset map | RAM | `key → (segment, offset)` of the latest record |
| Compaction job | Logic | Works on closed segments only |

## How the operations work

### Writes fill segments and roll over

Writing the base data in order (40-byte limit, text-line records):

```
wal-000001.log (closed)     wal-000002.log (closed)     wal-000003.log (active)
 0  iphone11:4.8             0  ipad:4.6                 0  pixel8:4.3
13  iphone12:4.7             9  airpods:4.5             11  galaxy:4.2
26  macbook:4.9             21  watch:4.4               22  kindle:4.1
38  (full: ipad won't fit)  31  (full: pixel8 won't fit) 33  (7 bytes free)
```

1. `ipad:4.6` is 9 bytes. Segment 1 holds 38 bytes, and 38 + 9 > 40, so create `wal-000002.log`, make it active, and append at offset 0.
2. The same happens for `pixel8`, which opens segment 3.

Now update macbook to "Apple" (16 bytes). Segment 3 has 7 bytes free, so `wal-000004.log` opens and the record goes to offset 0.

### The offset map

```
iphone11 → (1, 0)     ipad    → (2, 0)     pixel8 → (3, 0)
iphone12 → (1, 13)    airpods → (2, 9)     galaxy → (3, 11)
macbook  → (4, 0)     watch   → (2, 21)    kindle → (3, 22)
```

### Read airpods (in an older segment)

1. **RAM:** look up airpods and get `(2, 9)`.
2. **Disk:** open `wal-000002.log`, seek to 9 and read 4.5.

Reads can go to **any** segment; writes go **only** to the active one.

### Compact a closed segment while writes continue

1. The job picks `wal-000001.log`. It is closed, so nothing will ever be appended to it again.
2. It finds `macbook:4.9` there is stale, because the map points to segment 4.
3. It writes a new, smaller copy containing only `iphone11` and `iphone12`, and updates those two keys' offsets.
4. Meanwhile, new puts keep appending to `wal-000004.log` with **no waiting**, because the job and the writers never touch the same file.

## Trade-offs

| Gains | Costs |
|---|---|
| Compaction never blocks writes | Every read still goes to disk |
| Small files are cheap to compact, copy or move | Compaction's disk I/O competes with reads |
| Segments can later be spread across machines | The offset map still has one entry per key |
| Crash damage is confined to the active segment | |

## Why the next stage

Writes are now unaffected by compaction, but **reads are still affected**: every read is a disk access, and that disk is also busy with compaction. The freshest data, in the active segment, is exactly what is most likely to be read, so keep a copy of it in RAM.

## Revise

<details><summary>What is the active segment?</summary>

The newest WAL segment, the only one that accepts appends. All other segments are closed and read-only.
</details>

<details><summary>Why does the offset map need the segment number now?</summary>

Records are spread across several files, so an offset alone doesn't say which file it refers to.
</details>

<details><summary>When does a new segment start?</summary>

When appending the next record would exceed the active segment's size limit.
</details>

<details><summary>Why doesn't compaction block writes any more?</summary>

Compaction only touches closed segments, while writes only touch the active segment.
</details>

<details><summary>What is still wrong with reads?</summary>

Every read goes to disk, and it competes with compaction for disk I/O.
</details>
