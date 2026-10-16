# Revision notes

These notes walk through how a key-value storage engine is designed, one problem at a time: from a relational table, through a naive key-value file, to a complete LSM tree. Each stage explains the problem that forced a change, how the change works, step by step with a small worked example, what it costs, and why the next stage is needed.

The same small data set of product ratings (`iphone11 = 4.8`, `macbook = 4.9`, …) is used throughout, so the same keys can be followed from the first file layout to the final design.

## How to revise

1. **First pass:** read the stages in order. Each one depends on the previous.
2. **Second pass:** read only the "How the operations work" sections, and redraw each example from memory.
3. **Self-test:** open the "Revise" questions at the end of each stage and answer before expanding them.
4. **Last look:** the [cheat sheet](cheatsheet.md) and the [glossary](glossary.md).

## Stages

0. [Requirements](00-requirements.md)
1. [How a relational database stores rows](01-relational-rows.md)
2. [A naive key-value file](02-naive-key-value.md)
3. [Splitting values with pointers](03-pointer-splitting.md)
4. [Append instead of overwrite](04-append-only.md)
5. [An in-memory hash index](05-hash-index.md)
6. [Compacting one huge log](06-single-log-compaction.md)
7. [Many small log segments](07-log-segments.md)
8. [The memtable](08-memtable.md)
9. [Deferring the offset map](09-deferred-offset-map.md)
10. [Flushing to SSTables](10-sstable-flush.md)
11. [Merge compaction](11-merge-compaction.md)
12. [Dropping the offsets](12-binary-search-tables.md)
13. [The sparse index](13-sparse-index.md)
14. [Deletes and tombstones](14-tombstones.md)
15. [Bloom filters](15-bloom-filters.md)
16. [The complete LSM tree](16-complete-lsm.md)

## Reference

- [Cheat sheet](cheatsheet.md): every operation at every stage, plus the final read and write paths on one page.
- [Glossary](glossary.md): every term, defined plainly and then precisely.
