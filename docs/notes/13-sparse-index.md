# Stage 13: The sparse index

Split each SSTable into blocks, and keep a tiny index of where each block starts, so that a lookup reads **exactly one block** per table.

## The problem

Binary-searching a large SSTable jumps across many disk blocks: several random reads per table.

## The change

- A disk reads data in fixed-size **blocks**. Real systems use around 4 KiB; this example uses 32 bytes.
- When writing an SSTable, group its sorted entries into blocks. A new block starts when the next entry wouldn't fit.
- For each table, keep a **sparse index**: the **first key and the offset** of every block. It is *sparse* because it has one entry per block, not one per key, so it stays small enough to hold in RAM.
- A lookup:
  1. searches the sparse index, in RAM, for the last block whose first key is ≤ the key;
  2. reads **that one block** from disk;
  3. binary-searches inside the block, in RAM.

The block can't be made to cover a whole table: a flushed table might fit in one block, but tables produced by compaction are larger. The sparse index works at any table size.

## Components

| Component | Lives in | Job |
|---|---|---|
| Data blocks | Disk | The table's sorted entries in fixed-size chunks |
| Sparse index | RAM (stored in the table file, loaded once) | First key and offset of every block |

## How the operations work

`sst-000001-000002` (7 entries, text-line sizes) grouped into 32-byte blocks:

```
Block 1  offset 0   airpods:true (13)   ipad:4.6 (9)                  22 bytes
Block 2  offset 22  iphone11:4.8 (13)   iphone12:4.9 (13)             26 bytes
Block 3  offset 48  macbook:"Apple" (16)   pixel8:4.3 (11)            27 bytes
Block 4  offset 75  watch:4.4 (10)                                    10 bytes

Sparse index:  airpods → 0   iphone11 → 22   macbook → 48   watch → 75
```

### Read iphone12

1. **RAM:** in the sparse index, the last first-key ≤ `iphone12` is `iphone11`, so the key is in block 2 (offset 22, 26 bytes).
2. **Disk:** read bytes 22–47, one block.
3. **RAM:** binary search inside the block: found, 4.9.

### Read kindle (not in this table)

1. **RAM:** `iphone11` ≤ `kindle` < `macbook`, so the key can only be in block 2.
2. **Disk:** read block 2.
3. **RAM:** it holds iphone11 and iphone12, not kindle. The key is not in this table.

### Read aardvark (smaller than every key)

1. **RAM:** no block's first key is ≤ `aardvark`, so the key can't be in this table. **No disk read at all.**

## Trade-offs

| Gains | Costs |
|---|---|
| At most one disk read per table | A small index per table kept in RAM |
| Index size grows with blocks, not keys | The block still has to be read to confirm the key is absent |

## Why the next stage

An absent key still costs one block read **in every table** before we know it isn't there. For a key that doesn't exist at all, that's one wasted disk read per table. We need a cheap way to say "definitely not in this table" without touching the disk.

## Revise

<details><summary>What does a sparse index store?</summary>

The first key and the byte offset of each block in the SSTable.
</details>

<details><summary>Why is it called sparse?</summary>

It has one entry per block, not per key, so it is much smaller than a full index.
</details>

<details><summary>How is the right block found?</summary>

Search the sparse index for the last block whose first key is less than or equal to the key you are looking for.
</details>

<details><summary>How many disk reads does a lookup cost per table now?</summary>

At most one block read; zero if the key falls before the table's first key.
</details>

<details><summary>Why not just make every SSTable fit in one block?</summary>

Compaction produces larger tables, which span many blocks. The sparse index works at any size.
</details>
