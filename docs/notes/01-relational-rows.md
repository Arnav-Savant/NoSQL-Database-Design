# Stage 1: How a relational database stores rows

Before designing anything new, look at how a relational database (RDBMS) such as MySQL or PostgreSQL lays out a table. It works extremely well, and seeing *why* it works shows exactly what we lose when values become unstructured.

## The problem

We need a baseline. Relational databases are the most familiar storage engines, so they are the natural reference point for what "fast" and "organised" look like.

## The change

A relational table has a **fixed schema**: every column has a declared type, and every type has a known size. If every column's size is known, every row's size is known, and once row sizes are known, the database can calculate addresses instead of searching for them.

Take a `products` table:

| Column | Type | Size |
|---|---|---|
| `id` | integer | 8 bytes |
| `name` | string, at most 60 characters | 60 bytes |
| `price` | number | 8 bytes |
| `rating` | number | 8 bytes |
| **Row** | | **84 bytes** |

Every row is exactly 84 bytes, whatever it contains. A short name like "iPad" still occupies its full 60-byte slot.

## Components

| Component | Lives in | Job |
|---|---|---|
| Table file | Disk | Rows stored back to back, ordered by `id` |
| Schema | Logic | Fixes each column's type and size, which fixes every offset |

## How the operations work

The data, stored in `id` order:

```
offset 0     | id 1 | iPhone 11 ......... | 699  | 4.8 |
offset 84    | id 2 | iPhone 12 ......... | 799  | 4.7 |
offset 168   | id 3 | MacBook ........... | 1299 | 4.9 |
offset 252   | id 4 | iPad .............. | 499  | 4.6 |
              <-8-->|<---------60-------->|<-8-->|<-8->|
```

### Find the row with id 3

1. Read the `id` field at offset 0. It is 1, not a match.
2. Skip the rest of the row without reading it: jump straight to offset 0 + 84 = 84.
3. Read `id` at 84. It is 2. Jump to 168.
4. Read `id` at 168. It is 3: match. Read the 84 bytes of the row.

The rows are next to each other on disk, so these jumps stay within neighbouring blocks. Access is nearly sequential and therefore fast.

### Update the price of id 2 in place

1. Row 2 starts at offset 84.
2. The price column starts after `id` (8 bytes) and `name` (60 bytes), so it is 68 bytes into the row.
3. Overwrite the 8 bytes at offset 84 + 68 = 152.

The new price (say 749 instead of 799) fits in the same 8-byte slot. **The container never changes size, only its contents.** Nothing else in the file moves.

### Insert id 5

Append 84 bytes at the end of the file, at offset 4 × 84 = 336.

## Trade-offs

| Gains | Costs |
|---|---|
| Addresses are computed, not searched: jump by row size, jump by column offset | Every value must fit a declared type and maximum size |
| In-place updates never move other data | Space is wasted when values are shorter than their slot |
| Compact, contiguous storage with few gaps | Schema changes are expensive and must be planned |

## Notes

> **Note:** SQL is a standardised query language, not a particular database. Each database implements its own dialect of the standard, which is why some syntax works in MySQL but not in PostgreSQL, and vice versa.

> **Aside: making reads faster.** Scanning rows one by one is O(n). Relational databases speed up reads in three common ways:
> - an **index**, a separate structure such as a B+ tree that finds a row in O(log n);
> - a **cache** that keeps hot rows in memory;
> - **partitioning**, which splits a table across several stores so a lookup only searches the one partition that can contain the key.

## Why the next stage

All of this depends on knowing the types, and therefore the sizes, in advance. Our requirement is the opposite: **unstructured values** whose type can change. The natural model for that is a key-value store, similar to a hash map, a dictionary or a JSON object. The next stage tries storing key-value pairs with the same "lay bytes side by side" approach and watches it break.

## Revise

<details><summary>Why can a relational database jump directly to the next row?</summary>

Every row has the same size (84 bytes here) because every column has a fixed type and size, so the next row always starts exactly one row-size later.
</details>

<details><summary>At which byte offset does the price of row 2 start, and how is it computed?</summary>

At 152: row 2 starts at 84, and price is after id (8) and name (60), so 84 + 68 = 152.
</details>

<details><summary>Why is an in-place update safe in this layout?</summary>

The new value always fits the column's fixed slot, so the row never grows and nothing after it has to move.
</details>

<details><summary>What does an index change about reads?</summary>

It replaces a linear O(n) scan with a structured search, for example O(log n) in a B+ tree.
</details>

<details><summary>What single property of relational storage is incompatible with our requirements?</summary>

The fixed schema. We need values whose type, and therefore size, isn't known in advance.
</details>
