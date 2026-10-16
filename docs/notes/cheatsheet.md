# Cheat sheet

## How each operation works at each stage

A dash means the stage doesn't support or need the operation.

| Stage | Read | Insert | Update | Delete | Recovery | Flush | Compaction | Index lookup |
|---|---|---|---|---|---|---|---|---|
| [1 Relational rows](01-relational-rows.md) | jump by row size | append row | overwrite slot in place | — | — | — | — | optional B+ tree |
| [2 Naive key-value](02-naive-key-value.md) | byte-by-byte scan | append | overwrite (corrupts next record) | — | — | — | — | — |
| [3 Pointers](03-pointer-splitting.md) | scan + follow pointers | append | partial write + pointer | — | — | — | — | — |
| [4 Append-only](04-append-only.md) | full scan, last match wins | append | append new version | — | — | — | — | — |
| [5 Hash index](05-hash-index.md) | hash lookup + 1 seek | append + map | append + move offset | — | rebuild map from WAL | — | — | offset map |
| [6 Single-log compaction](06-single-log-compaction.md) | hash lookup + 1 seek | append (blocked during compaction) | append + move offset | — | rebuild map | — | rewrite live file | offset map |
| [7 Segments](07-log-segments.md) | map → (segment, offset) | append to active | append to active | — | rebuild map from all segments | — | closed segments only | offset map |
| [8 Memtable](08-memtable.md) | memtable, else map | WAL + memtable + map | WAL + memtable + map | — | replay active WAL + scan segments | — | closed segments | offset map |
| [9 Deferred map](09-deferred-offset-map.md) | memtable, else map | WAL + memtable | WAL + memtable | — | as stage 8 | bulk map update at roll-over | closed segments | offset map |
| [10 SSTables](10-sstable-flush.md) | memtable, else map | WAL + memtable (dirty) | WAL + memtable (dirty) | — | replay active WAL (dirty only) | dirty → sorted SSTable | — | offset map |
| [11 Merge compaction](11-merge-compaction.md) | memtable, else map | same | same | — | same | same | two-pointer merge, newer wins | offset map |
| [12 Binary search](12-binary-search-tables.md) | memtable, then tables newest → oldest, binary search | same | same | — | same | same | same | none |
| [13 Sparse index](13-sparse-index.md) | memtable, then one block per table | same | same | — | same | same | same | sparse index |
| [14 Tombstones](14-tombstones.md) | tombstone = not found | same | same | append tombstone | same | same | drop tombstone only with oldest data | sparse index |
| [15 Bloom filters](15-bloom-filters.md) | Bloom filter → sparse index → block | same | same | tombstone | same | same | same | Bloom + sparse |
| [16 Complete](16-complete-lsm.md) | all of the above | WAL + memtable | WAL + memtable | tombstone | tmp cleanup, range cleanup, WAL replay with CRC | as stage 10 | as stage 14 | Bloom + sparse |

## The final write path, on one page

```
put(key, value) / delete(key)
  1. WAL     append [crc | length | entry] and fsync         ← durable from here on
  2. RAM     memtable[key] = entry (dirty); evict a clean entry if full
  3. Check   WAL ≥ limit or memtable full of dirty → flush
                 flush: sort dirty → write SSTable (tmp, fsync, rename)
                        mark clean → new WAL → delete old WAL
                        → compact while tables ≥ trigger
```

## The final read path, on one page

```
get(key)
  1. RAM     memtable hit?  → value (or not found if tombstone)
  2. For each SSTable, newest → oldest:
       a. RAM   Bloom filter says no?            → next table
       b. RAM   sparse index → one block
       c. Disk  read that block
       d. RAM   binary search in block
                found → cache as clean → value (or not found if tombstone)
                absent (false positive) → next table
  3. Not found
```

## Numbers worth remembering

| Fact | Value |
|---|---|
| RAM access | ~100 ns |
| Spinning-disk random seek | ~10 ms |
| Typical block size | ~4 KiB |
| Bloom filter at 10 bits per key, k = 7 | ~1% false positives |
| Bloom false-positive rate | (1 − e^(−kn/m))^k |
| Binary search over n entries | ~log₂(n) comparisons |
