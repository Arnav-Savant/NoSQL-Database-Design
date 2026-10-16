# Stage 15: Bloom filters

Give every SSTable a small **Bloom filter**: a compact structure that can answer "is this key possibly in the table?" from RAM. A "no" is always correct, so most tables that don't contain the key are skipped without any disk read.

## The problem

A read for a key that isn't in a table still reads one block from that table. Reads for missing keys pay one disk read per table.

## The change

A **Bloom filter** is a probabilistic, space-efficient set-membership test:

- It is an array of **m bits**, all initially 0, plus **k hash functions**, each mapping a key to a bit position from 0 to m−1.
- **Add a key:** compute its k positions and set those bits to 1.
- **Check a key:** compute its k positions.
  - If **any** of those bits is 0, the key is **definitely not** in the set.
  - If **all** are 1, the key is **possibly** in the set. The bits may have been set by other keys: a **false positive**.
- It can never give a **false negative**. A key that was added always has all of its bits set.

Its size is fixed when it is built and does **not** grow with each key, unlike a hash map. The table's filter lives in the table file and is loaded into RAM once.

The engines in `codebases/` derive the k positions from two FNV-1a hashes of the key (double hashing): position *i* is `(h1 + i·h2) mod m`.

## Components

| Component | Lives in | Job |
|---|---|---|
| Bloom filter (one per table) | RAM (stored in the table file) | Answers "definitely not here" or "maybe here" without a disk read |
| Sparse index | RAM | Finds the one block to read on a "maybe" |

## How the operations work

`sst-000003-000003` holds `galaxy, ipad, kindle, macbook`. Its filter uses m = 32 bits and k = 3 hashes.

### Build the filter

| Key | Bit positions |
|---|---|
| galaxy | 17, 26, 3 |
| ipad | 25, 22, 19 |
| kindle | 8, 21, 2 |
| macbook | 29, 28, 27 |

```
bit:  0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
      0 0 1 1 0 0 0 0 1 0  0  0  0  0  0  0  0  1  0  1  0  1  1  0  0  1  1  1  1  1  0  0
```

12 of the 32 bits are set.

### Check nokia: definitely absent

1. The positions are 13, 8, 3.
2. Bit 13 is **0**. nokia was never added: **skip this table, with no disk read.**

### Check oneplus: a false positive

1. The positions are 19, 8, 29, and **all three are 1**. They were set by ipad, kindle and macbook.
2. The filter says "maybe". Use the sparse index to find the block and read it.
3. oneplus isn't in the block. That cost one wasted block read, and the read moves on to the next table.

### Read with filters (the full lookup per table)

For each table, newest to oldest:
1. **Bloom filter (RAM):** "no" means skip the table.
2. **Sparse index (RAM):** pick the one block.
3. **Disk:** read that block.
4. **RAM:** binary search inside it. If found, return the value (or not found for a tombstone). Otherwise continue to the next table.

## How often are false positives?

With n keys, m bits and k hashes, the false-positive rate is approximately

```
(1 − e^(−k·n/m))^k
```

For this table, n = 4, m = 32, k = 3: (1 − e^(−0.375))³ ≈ 0.031, about **3%**.

Real systems size each filter from its own key count, for example **10 bits per key** with k = 7, which gives roughly **1%**. The engines use `bitCount = max(64, keys × bitsPerKey)` and `k = round(bitsPerKey × 0.693)`.

## Trade-offs

| Gains | Costs |
|---|---|
| Most tables without the key are skipped with zero disk reads | A few bits of RAM per key per table |
| Fixed, small size per table | False positives still cost one block read |
| Never misses a key that is present | Bits can't be removed; a filter is rebuilt when a table is rewritten |

## Notes

> **Note:** "fixed size" means the filter doesn't grow as keys are added. Adding more keys to the same bits sets more of them to 1 and raises the false-positive rate. That's why each table sizes its filter from the number of keys it holds.

## Why the next stage

Every piece is now in place. The final stage puts them together and walks every operation through the complete system.

## Revise

<details><summary>What are the two possible answers of a Bloom filter, and which one is always correct?</summary>

"Definitely not present", which is always correct, and "possibly present", which may be a false positive.
</details>

<details><summary>How is a key added to a Bloom filter?</summary>

Hash it with each of the k hash functions and set the k resulting bit positions to 1.
</details>

<details><summary>Why can a Bloom filter never produce a false negative?</summary>

Adding a key sets all of its bits, and bits are never cleared, so a key that was added always finds all of its bits set.
</details>

<details><summary>In the example, why is oneplus a false positive?</summary>

Its positions 19, 8 and 29 were all set by other keys (ipad, kindle and macbook), even though oneplus was never added.
</details>

<details><summary>How does the false-positive rate change as more keys are added to the same filter?</summary>

It rises, because more bits become 1. That is why filters are sized per table using bits per key.
</details>

<details><summary>Why use a Bloom filter instead of a per-table hash set of keys?</summary>

A hash set grows with every key and stores the keys themselves; a Bloom filter uses a few bits per key and still rules out most absent keys.
</details>
