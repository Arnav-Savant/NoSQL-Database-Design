# Glossary

Each term has a plain definition first, then the precise meaning, then the stage where it is introduced.

**Append-only.** You only ever add to the end; you never change what's already written. Records are written strictly at the end of a file; updates and deletes become new records. See [stage 4](04-append-only.md).

**Block.** A small, fixed-size chunk of a file that is read in one go. The unit an SSTable's entries are grouped into, so a lookup reads exactly one block per table (about 4 KiB in real systems). See [stage 13](13-sparse-index.md).

**Bloom filter.** A tiny summary that can say "definitely not here" or "maybe here". An m-bit array plus k hash functions; adding a key sets k bits; any 0 bit on lookup proves absence; all 1s may be a false positive. See [stage 15](15-bloom-filters.md).

**Cache.** A copy of data kept somewhere faster so it can be read cheaply. In this design, the clean entries of the memtable. See [stage 10](10-sstable-flush.md).

**Clean entry.** A memtable entry that is already saved in an SSTable. It can be evicted safely, because its data is on disk. See [stage 10](10-sstable-flush.md).

**Compaction.** Cleaning up old versions in the background. Merging sorted tables into fewer, larger ones, keeping only the newest entry per key and dropping tombstones when no older data remains. See [stage 6](06-single-log-compaction.md) and [stage 11](11-merge-compaction.md).

**CRC-32.** A short fingerprint of some bytes that changes if any byte changes. A 32-bit checksum stored with every WAL record, used during recovery to detect a torn write. See [stage 16](16-complete-lsm.md).

**Dirty entry.** A memtable entry written since the last flush. Its newest value exists only in the WAL, so it must never be evicted. See [stage 10](10-sstable-flush.md).

**Durability.** Once a write is confirmed, it survives crashes and power loss. Achieved by forcing the WAL record to disk (fsync) before acknowledging the write. See [stage 0](00-requirements.md).

**Eviction policy.** The rule for what to throw out when the cache is full.
- **LRU:** removes the least recently used entry.
- **LFU:** removes the least frequently used entry.
- **FIFO:** removes the oldest inserted entry.

Here, only clean entries are candidates. See [stage 10](10-sstable-flush.md).

**False positive.** The filter said "maybe", but the key isn't there. A Bloom filter result where all k bits are set by other keys; it costs one wasted block read. See [stage 15](15-bloom-filters.md).

**Flush.** Moving recent writes from memory into a permanent sorted file. Sorting the memtable's dirty entries into a new SSTable, marking them clean, starting a new WAL and deleting the old one. See [stage 10](10-sstable-flush.md).

**fsync.** Telling the operating system "really put this on the disk now". A system call that forces buffered data to physical storage; without it, a "completed" write can still be lost on power failure. See [stage 16](16-complete-lsm.md).

**Hit ratio.** How often the answer is already in memory. The fraction of reads served by the memtable without a disk access. See [stage 8](08-memtable.md).

**Immutable.** Never changed after it is created. SSTables are written once; compaction creates new tables instead of editing old ones. See [stage 10](10-sstable-flush.md).

**Key-value store.** A database that maps keys to values, like a dictionary. Values carry no fixed schema; the store reads and writes whole values by key. See [stage 2](02-naive-key-value.md).

**LSM tree (log-structured merge tree).** The whole design in these notes: writes are logged, and sorted files are merged in the background. WAL + memtable + immutable sorted SSTables + compaction. See [stage 16](16-complete-lsm.md).

**Memtable.** The in-memory part of the database. A hash map in RAM holding the newest value of recently written keys (dirty) and a cache of recently read keys (clean). See [stage 8](08-memtable.md).

**Offset.** A position in a file, counted in bytes from its start. See [stage 5](05-hash-index.md).

**Offset map.** A table in RAM that remembers where each key's latest record is. Maps `key → offset` (later `key → (file, offset)`); removed once tables are sorted. See [stage 5](05-hash-index.md) and [stage 12](12-binary-search-tables.md).

**Random access.** Jumping to an arbitrary place on disk. It requires a seek (spinning disks) or a separate request (SSDs), and is far slower than reading neighbouring bytes. See [stage 3](03-pointer-splitting.md).

**Sequence number.** A counter that orders files by age. Each WAL gets the next number; an SSTable is named by the range of numbers it covers (`sst-000001-000002`), which decides which table is newer. See [stage 11](11-merge-compaction.md).

**Sequential access.** Reading or writing bytes that sit next to each other. The cheapest disk access pattern; appends are sequential writes. See [stage 0](00-requirements.md).

**Sparse index.** A short list of where each block starts. One entry per block (first key and offset), small enough to keep in RAM. See [stage 13](13-sparse-index.md).

**SSTable (Sorted String Table).** A permanent, sorted, duplicate-free file. An immutable file of entries sorted by key, one per key, with blocks, a sparse index and a Bloom filter. See [stage 10](10-sstable-flush.md).

**Stale record.** An old version that has been replaced by a newer one. It stays on disk until compaction removes it. See [stage 4](04-append-only.md).

**Tombstone.** A "this key is deleted" marker. A distinct entry type written by a delete; it hides older values and is dropped by compaction once no older data can contain the key. See [stage 14](14-tombstones.md).

**Torn write.** A record that was only partly written when the crash happened. Detected during WAL replay by a short read or checksum mismatch; the WAL is truncated at that point. See [stage 16](16-complete-lsm.md).

**WAL (write-ahead log).** The file every write goes to first. An append-only, fsynced log that makes writes durable and is replayed after a crash. See [stage 5](05-hash-index.md).

**WAL segment.** One of several small WAL files. Only the newest (active) segment accepts writes; the others are closed and read-only. See [stage 7](07-log-segments.md).
