import { crashAndRecovery, flushAndCompaction, readMemtableHit, readThroughTables, TORN_BYTES, writePath } from '@/engine/architectures/s16CompleteLsm';
import { S16_SNIPPETS } from '../snippets/s16';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S16: StageContent = {
  ...STAGE_INDEX[16]!,
  summary:
    'All the pieces together: a write-ahead log, a memtable that is both write buffer and cache, immutable SSTables with blocks, sparse indexes and Bloom filters, a compactor and a recovery manager. This structure is a log-structured merge tree (LSM tree).',
  problemDetail: [
    'Each earlier stage fixed one weakness. This stage runs them as one system, with the same file names, sizes and bits as the engines’ demo, and follows every operation end to end.',
  ],
  change: [
    'Log-structured: every write is an append to a log. Merge: sorted files are merged in the background. Tree: those merges build larger tables out of smaller ones.',
    'Write: append to the WAL and fsync, upsert into the memtable as dirty, flush when the WAL or the memtable is full. A delete is the same with a tombstone.',
    'Read: the memtable first; then each table newest to oldest, through its Bloom filter, its sparse index and one block; cache what is found as clean.',
    'Flush and compaction: dirty entries become a sorted table; when there are three tables, the two oldest are merged. Recovery cleans up and replays the WAL after a crash.',
  ],
  components: [
    { name: 'Write-ahead log (WAL)', location: 'disk', purpose: 'Makes every write durable before anything else happens; replayed after a crash.' },
    { name: 'Memtable', location: 'ram', purpose: 'Newest value of recently written keys (dirty) plus a cache of recently read keys (clean).' },
    { name: 'Eviction policy', location: 'logic', purpose: 'Drops the least recently used clean entry when the memtable is full; never a dirty one.' },
    { name: 'SSTables', location: 'disk', purpose: 'Immutable, sorted, one entry per key, named by the WAL sequence range they cover.' },
    { name: 'Sparse index and Bloom filter', location: 'ram', purpose: 'Loaded once per table: pick one block, or skip the table entirely.' },
    { name: 'Compactor', location: 'logic', purpose: 'Merges the two oldest tables, newer entry wins, drops tombstones when safe.' },
    { name: 'Recovery manager', location: 'logic', purpose: 'Removes leftovers, opens tables and replays the WAL, truncating a torn tail.' },
  ],
  limitations: [
    { title: 'One fsync per write', body: 'Forcing every write to disk on its own is the safest choice and limits throughput. Production systems group several writes into one fsync.' },
    { title: 'Simplest compaction', body: 'Merging the two oldest tables keeps the rules easy to follow. Production engines organise tables into levels or size tiers to bound how much data each merge rewrites.' },
  ],
  notes: [
    {
      title: 'Atomic tables',
      body: 'A table is written to a .tmp file, fsynced, then renamed. A rename is atomic, so after a crash there is either a complete table under its final name or a temporary file that recovery deletes, never a half-written table.',
    },
    {
      title: 'Why the WAL is deleted only after the flush',
      body: 'The old WAL is removed only once its table is on disk. A crash in between leaves both; recovery sees that the table already covers that WAL’s sequence number and deletes the WAL then.',
    },
    {
      title: 'Leftover merge inputs',
      body: 'A merge writes its output before deleting its inputs. A crash in between leaves inputs whose ranges lie inside the output’s range, for example sst-000002-000002 inside sst-000001-000003, and recovery removes them.',
    },
  ],
  asides: [
    {
      title: 'How each requirement is met',
      body: 'Fast writes: one sequential WAL append plus one RAM update; flushing and merging happen later, in bulk. Fast reads: recent and popular keys come from the memtable; otherwise each table costs a Bloom filter check in RAM and at most one block read. Durability: the WAL is fsynced before a write is acknowledged, tables are published by atomic rename, and recovery repairs torn writes and interrupted flushes or merges. Unstructured values: every value carries its own type and length. A few petabytes: data lives in immutable SSTables that can be copied to and spread across machines, with only a few bits per key and one index entry per block kept in RAM.',
    },
    {
      title: 'Where LSM trees run',
      body: 'Cassandra, ScyllaDB, RocksDB, LevelDB and Bigtable all store data this way: a log for durability, a sorted in-memory table, immutable sorted files with filters and indexes, and background merges.',
    },
  ],
  requirements: {
    reads: { level: 'met', reason: 'Memtable first, then per table a Bloom check, a sparse index lookup and at most one block read.' },
    writes: { level: 'met', reason: 'One fsynced WAL append and one memtable update; flushes and merges happen later, in bulk.' },
    durability: { level: 'met', reason: 'Fsynced WAL, atomically renamed tables, and recovery that truncates torn writes.' },
    unstructured: { level: 'met', reason: 'Every entry carries its own type and length; there is no schema.' },
    scale: { level: 'met', reason: 'Immutable tables can be spread across machines; RAM per table is a few bits per key.' },
  },
  walkthroughs: [
    { id: 'write', title: 'The write path', operation: 'insert', summary: 'Append and fsync, upsert as dirty, check the limits.', build: writePath },
    { id: 'read-hit', title: 'Read: memtable hit', operation: 'read', summary: 'galaxy is answered from RAM with no file touched.', build: readMemtableHit },
    { id: 'read-tables', title: 'Read: through the tables', operation: 'read', summary: 'A Bloom “no”, a Bloom “maybe”, one block, then cache it as clean.', build: readThroughTables },
    { id: 'flush', title: 'Flush and compaction', operation: 'flush', summary: 'One write fills the memtable, flushes a table, and triggers a merge.', build: flushAndCompaction },
    { id: 'recover', title: 'Crash and recovery', operation: 'recover', summary: `Clean up, replay the WAL, and truncate ${TORN_BYTES} torn bytes.`, build: crashAndRecovery },
  ],
  snippets: S16_SNIPPETS,
};
