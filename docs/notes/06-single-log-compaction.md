# Stage 6: Compacting one huge log

The WAL grows forever because stale records are never removed. The obvious fix is a background job that cleans them out. This stage shows why doing that on a single, live file goes wrong.

## The problem

Every update leaves a stale record behind. A key updated 1,000 times costs 1,000 records on disk but only one is useful. With a stream of updates, the file can be many times larger than the live data.

## The change

Run **compaction**: a background job that periodically removes stale records from the WAL, keeping only the latest record for each key.

## Components

| Component | Lives in | Job |
|---|---|---|
| WAL (single file) | Disk | All records, including stale ones |
| Offset map | RAM | Latest offset per key |
| Compaction job | Logic | Removes stale records from the same file |

## How the operations work

Starting state (from stage 5, after pixel8 was added and macbook updated):

```
WAL                              Offset map
offset 0   iphone11:4.8          iphone11 → 0
offset 13  iphone12:4.7          iphone12 → 13
offset 26  macbook:4.9  (stale)  macbook  → 58
offset 38  ipad:4.6              ipad     → 38
offset 47  pixel8:4.3            pixel8   → 47
offset 58  macbook:"Apple"
offset 74  (end)
```

### Compact the live file

1. The job finds that `macbook:4.9` at offset 26 is stale, because the map points macbook at 58.
2. It removes those 12 bytes. **Every record after offset 26 shifts 12 bytes to the left**:

   ```
   ipad      38 → 26
   pixel8    47 → 35
   macbook   58 → 46
   ```

3. Every shifted key's entry in the offset map is now wrong and must be rewritten. That is three map updates for one removed record. In a large file, removing one record near the start shifts millions of records.
4. Meanwhile, a new `put airpods = 4.5` arrives. Where does it go? The end of the file is moving while the job rewrites it. The write must **wait** until the job finishes.
5. The file is huge, so the job can't load it all at once. It has to process the file **chunk by chunk**, rewriting a piece at a time while keeping the map consistent.

## Trade-offs

| Gains | Costs |
|---|---|
| Stale records are eventually removed | Writes are blocked while the file is rewritten |
| | Every shifted record forces an offset-map update |
| | Reads see shifting offsets and must be coordinated with the job |
| | A huge file must be processed in chunks anyway |

## Notes

> **Note:** an in-place rewrite also breaks the "never modify existing bytes" property from stage 4, which is what made appends safe and crashes simple.

## Why the next stage

The compaction job already wants to work **chunk by chunk**, and it conflicts with writes because writes and compaction touch the **same file**. So split the log into many small files from the start: one receives writes, and the others can be compacted without getting in the way.

## Revise

<details><summary>What is compaction?</summary>

A background process that removes stale records, keeping only the latest version of each key.
</details>

<details><summary>Why does removing one record make the offset map wrong?</summary>

Removing bytes shifts every later record to a new offset, so every shifted key's stored offset is now stale.
</details>

<details><summary>Why are writes blocked during single-file compaction?</summary>

The end of the file, where appends go, is moving while the job rewrites the file, so new appends must wait until it finishes.
</details>

<details><summary>Which observation leads directly to the next stage?</summary>

The job has to work chunk by chunk anyway, so it is better to keep the log as many small files where only one receives writes.
</details>

<details><summary>Which earlier property does an in-place rewrite of the log break?</summary>

The append-only rule that existing bytes are never modified, which is what kept writes safe and crash damage limited to the last record.
</details>
