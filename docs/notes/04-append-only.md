# Stage 4: Append instead of overwrite

The turning point of the whole design: **never modify existing bytes. Every change is a new record at the end of the file.**

## The problem

In-place updates either corrupt neighbours (stage 2) or fragment values across the disk (stage 3).

## The change

The file becomes **append-only**:

- An **insert** appends a record.
- An **update** also appends a record, a newer version of the same key.
- Old records are never touched. When the same key appears several times, **the last occurrence is the current value**; earlier ones are **stale**.

From here on, the examples use a readable text-line record format, `key:value` followed by a newline byte, so byte counts are easy to follow. (The real engines use a binary, length-prefixed format; see stage 16.)

```
iphone11:4.8\n   13 bytes
macbook:4.9\n    12 bytes
macbook:"Apple"\n 16 bytes   (string values are quoted)
```

## Components

| Component | Lives in | Job |
|---|---|---|
| Append-only file | Disk | Every insert and update is a new record at the end |

## How the operations work

### Update macbook to "Apple"

The file before the update:

```
offset 0   iphone11:4.8
offset 13  iphone12:4.7
offset 26  macbook:4.9
offset 38  ipad:4.6
offset 47  (end)
```

1. Append `macbook:"Apple"` at offset 47. This is a sequential write, the cheapest kind.
2. Leave `macbook:4.9` at offset 26 exactly where it is. It is now **stale**.

```
offset 26  macbook:4.9        ← stale
offset 47  macbook:"Apple"    ← current
```

No record moved, nothing was overwritten, and the value changed type freely.

### Read macbook

1. Scan the whole file from the start.
2. Every time `macbook` appears, remember its value.
3. At the end of the file, the remembered value is the current one: "Apple".

The scan **can't stop at the first match**, because a newer version might appear later.

## Trade-offs

| Gains | Costs |
|---|---|
| Writes are pure sequential appends: as fast as the disk allows | Reads are full-file scans, O(n) |
| No corruption, no fragmentation | Stale versions are never removed, so the file grows forever |
| Values can change type and size freely | |
| A crash can only damage the last, half-written record | |

## Notes

> **Note:** scanning **backwards** from the end and stopping at the first match gives the same answer and usually finishes sooner, because recent keys are near the end.

> **Aside: lazy removal.** The same "add the new version, ignore the old one later" trick appears in Dijkstra's shortest-path algorithm. `std::priority_queue` in C++ can't update an element's priority, so implementations push a new entry and skip stale ones when they are popped:
>
> ```cpp
> pq.push({newDistance, node});            // never update in place
> while (!pq.empty()) {
>     auto [distance, node] = pq.top(); pq.pop();
>     if (distance > best[node]) continue;  // stale entry: skip it
>     relaxNeighbours(node, distance);
> }
> ```
>
> Doing the work only when it's needed, instead of immediately, is called a **lazy** operation.

## Why the next stage

Writes are now ideal and the corruption is gone. The remaining big problem is that **every read scans the entire file**. The next stage adds a structure that knows where each key's latest record is.

## Revise

<details><summary>What does an update do in an append-only file?</summary>

It appends a new record for the key. The previous record stays where it is and becomes stale.
</details>

<details><summary>How does a reader know which version is current?</summary>

The last occurrence in the file is the newest, because records are only ever added at the end.
</details>

<details><summary>Why can't a forward scan stop at the first match?</summary>

A newer version of the key may appear later in the file.
</details>

<details><summary>Name two benefits of append-only writes besides speed.</summary>

Nothing is overwritten, so neighbouring records are never corrupted; and values can change type or size freely. A crash can also only damage the final record.
</details>

<details><summary>What new problem does append-only create?</summary>

The file grows forever, because stale versions are never removed.
</details>
