# Stage 11: Merge compaction

Combine sorted SSTables into one larger sorted SSTable, keeping only the newest version of each key, the same way merge sort combines two sorted arrays.

## The problem

Each SSTable is duplicate-free on its own, but the same key can appear in several tables, and the number of tables grows with every flush.

## The change

A background **compactor** merges tables:

1. Pick two adjacent tables. They are sorted, and small enough to process comfortably.
2. Walk both with **two pointers**, as in the merge step of merge sort.
3. On equal keys, keep the entry from the **newer** table and discard the older one.
4. Write the result as a new SSTable named by the **range of sequence numbers** it covers, for example `sst-000001-000002.sst`.
5. Delete the two inputs.

Because SSTables are immutable, a merge never edits a table: it only creates a new one and then deletes the old ones. Reads continue against the old tables until the new one is in place.

## Components

| Component | Lives in | Job |
|---|---|---|
| SSTables | Disk | Sorted, immutable inputs and outputs |
| Merge buffers and pointers | RAM | The two-pointer walk |
| Compactor | Logic | Chooses tables, merges, swaps the result in |

## How the operations work

### Merge sst-1 and sst-2

```
older  sst-000001-000001:  ipad=4.6  iphone11=4.8  iphone12=4.7  macbook="Apple"
newer  sst-000002-000002:  airpods=true  iphone12=4.9  pixel8=4.3  watch=4.4
```

| Step | Left (older) | Right (newer) | Compare | Emit |
|---|---|---|---|---|
| 1 | ipad | airpods | right is smaller | airpods=true (right moves) |
| 2 | ipad | iphone12 | left is smaller | ipad=4.6 (left moves) |
| 3 | iphone11 | iphone12 | left is smaller | iphone11=4.8 (left moves) |
| 4 | iphone12 | iphone12 | **equal** | iphone12=**4.9** from the newer table; both move, 4.7 is dropped |
| 5 | macbook | pixel8 | left is smaller | macbook="Apple" (left moves) |
| 6 | (done) | pixel8 | left exhausted | pixel8=4.3 |
| 7 | (done) | watch | left exhausted | watch=4.4 |

Result, `sst-000001-000002.sst`:

```
airpods=true  ipad=4.6  iphone11=4.8  iphone12=4.9  macbook="Apple"  pixel8=4.3  watch=4.4
```

There are 4 + 4 inputs and 7 outputs. The output holds the **union** of the keys: every key from either table, once.

### The merge tree

With four tables, merges can run as a tree, bottom-up, like merge sort:

```
sst-1   sst-2   sst-3   sst-4
   \     /         \     /
  sst-1-2         sst-3-4        (these two merges are independent, so they can run on separate threads)
        \           /
         sst-1-4
```

The engine in `codebases/` uses a simple strategy: when the number of tables reaches a trigger (3 in the demo), merge the **two oldest** tables. Repeating this grows one large old table and keeps the count of tables small.

### Why names carry a range

Reads must check newer tables before older ones (stage 12). If the merged output got a brand-new, higher number, it would look **newer** than tables that actually hold newer data. Naming it by the range it covers (`1-2`) keeps the order correct: it covers sequences up to 2, so it is older than `sst-3`.

## Trade-offs

| Gains | Costs |
|---|---|
| Duplicates are removed across tables, freeing disk space | Compaction reads and rewrites data, using disk I/O |
| Fewer tables to check on a read | Temporary extra space while both inputs and the output exist |
| Merging sorted inputs is linear and sequential | |
| Writes are never blocked | |

## Notes

> **Note:** a merge only needs one entry from each input at a time, so real compactors **stream** through the inputs instead of loading whole tables into RAM. The demo loads them because the tables are tiny.

> **Note:** after a merge has finished writing its output, the inputs are deleted. If a crash happens between those two moments, both the output and its inputs exist. On restart, any table whose range lies inside another table's range is a leftover input and is deleted.

## Why the next stage

Each key now has at most one entry per table and there are few tables. Yet the offset map still keeps one RAM entry for every key, which won't scale to billions of keys. The tables are **sorted**, so the offsets can be found by searching instead of remembering them.

## Revise

<details><summary>Which algorithm does merge compaction resemble?</summary>

The merge step of merge sort: two sorted inputs walked with two pointers to produce one sorted output.
</details>

<details><summary>What happens when both pointers see the same key?</summary>

The entry from the newer table is emitted, the older one is discarded, and both pointers advance.
</details>

<details><summary>How many entries does the merged table hold?</summary>

The size of the union of the two key sets, 7 in the example.
</details>

<details><summary>Why is the output named sst-000001-000002 instead of a new, higher number?</summary>

So that ordering by recency stays correct: it holds data up to sequence 2, and must stay older than sst-3.
</details>

<details><summary>Why can compaction run without blocking writes?</summary>

It only reads immutable SSTables and writes a new file; writes go to the WAL and memtable, which compaction never touches.
</details>
