# Stage 12: Dropping the offsets

The tables are sorted, so the per-key offset map can go. Search the tables instead.

## The problem

The offset map keeps one RAM entry per key. With billions of keys, it no longer fits in memory.

## The change

- Remove the offset map entirely.
- To read a key that isn't in the memtable, check the SSTables **from newest to oldest**, and **binary search** each one. Binary search halves the search range at each step, so it costs O(log n) comparisons instead of O(1) for a hash lookup. That's a small price for removing a structure that grows with every key.
- Stop at the first table that has the key.

## Components

| Component | Lives in | Job |
|---|---|---|
| Memtable | RAM | Newest data and cache |
| SSTables | Disk | Sorted, searched newest to oldest |
| (Offset map) | — | Removed |

## How the operations work

The third WAL (`galaxy=4.2, kindle=4.1, ipad="M4", macbook="M4 Pro", kindle="Paperwhite"`) has been flushed, and sst-1 and sst-2 were merged:

```
newest  sst-000003-000003:  galaxy=4.2  ipad="M4"  kindle="Paperwhite"  macbook="M4 Pro"
oldest  sst-000001-000002:  airpods=true  ipad=4.6  iphone11=4.8  iphone12=4.9  macbook="Apple"  pixel8=4.3  watch=4.4
```

Assume the memtable is empty, as after a restart.

### Read iphone11

1. **RAM:** memtable miss.
2. **Disk, sst-3**, binary search over 4 entries (positions 0–3):
   - `low=0, high=3, mid=1` gives `ipad`. Is `iphone11` > `ipad`? Yes (`h` > `a`), so `low=2`.
   - `low=2, high=3, mid=2` gives `kindle`. Is `iphone11` < `kindle`? Yes (`i` < `k`), so `high=1`.
   - `low > high`: not in this table.
3. **Disk, sst-1-2**, binary search over 7 entries:
   - `mid=3` gives `iphone12`; `iphone11` is smaller, so `high=2`.
   - `mid=1` gives `ipad`; `iphone11` is larger, so `low=2`.
   - `mid=2` gives `iphone11`: **found**, 4.8.

### Read ipad: order matters

1. sst-3 is checked first and has `ipad="M4"`. Return "M4" and stop.
2. sst-1-2 also contains `ipad=4.6`, but it is older and never consulted.

If the tables were checked oldest first, the read would return the outdated 4.6. **Newest to oldest, first match wins** is what makes reads correct.

## Trade-offs

| Gains | Costs |
|---|---|
| No RAM structure that grows with the number of keys | Every table may need to be searched for one read |
| Correct "latest value" semantics through ordering | Each binary-search step can land on a different part of the file: random disk reads |

## Notes

> **Note:** a binary search over a large file is not a single disk read. Each step jumps to a new position, often a different disk block, so one lookup can cost about log₂(n) random reads per table.

## Why the next stage

The search must be narrowed so that each table costs **one** disk read, not log₂(n) of them.

## Revise

<details><summary>Why can the offset map be removed?</summary>

Every SSTable is sorted, so a key's position can be found by binary search instead of being remembered.
</details>

<details><summary>In which order are tables checked, and why?</summary>

Newest to oldest, stopping at the first match, so the most recent value of the key is returned.
</details>

<details><summary>What does a binary search cost, in comparisons and in disk terms?</summary>

O(log n) comparisons; but each one can touch a different disk block, so up to about log₂(n) random reads per table.
</details>

<details><summary>What would go wrong if ipad were looked up oldest table first?</summary>

The read would return the outdated 4.6 from sst-1-2 instead of the current "M4".
</details>

<details><summary>Why does a binary search over one table cost several disk reads?</summary>

Each step jumps to a new middle position that usually lies in a different disk block, so each step can be a separate random read.
</details>
