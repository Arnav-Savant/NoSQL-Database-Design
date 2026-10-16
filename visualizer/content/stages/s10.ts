import { duplicatesAcrossTables, evictionSkipsDirty, flushFirstWal, readFillsCache } from '@/engine/architectures/s10SSTableFlush';
import { S10_SNIPPETS } from '../snippets/s10';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S10: StageContent = {
  ...STAGE_INDEX[10]!,
  summary:
    'When the active WAL fills up, write the memtable’s duplicate-free view of it to disk, sorted by key. That file is an SSTable. The memtable is not emptied: its entries stay in RAM as a cache.',
  problemDetail: [
    'Closed WAL files keep every stale record, in arrival order. Meanwhile the memtable already holds a deduplicated copy of the same data, one entry per key.',
    'Keeping both the raw log and the clean copy around wastes disk space and leaves the log growing until something cleans it.',
  ],
  change: [
    'A Sorted String Table (SSTable) is an immutable file holding one entry per key, sorted by key. Sorted makes it searchable, one entry per key means no duplicates inside it, and immutable means it is written once and never modified.',
    'A flush turns the memtable’s dirty entries into a new SSTable when the WAL reaches its size limit (128 bytes in the demo configuration), then deletes the WAL it replaces.',
    'Every memtable entry now has a state. Dirty means written since the last flush, so its newest value exists only in the WAL. Clean means it is already saved in an SSTable.',
    'The memtable has a capacity (6 entries here). When a new key needs a slot, an eviction policy removes a clean entry; LRU, least recently used, is the default. Dirty entries are never evicted.',
  ],
  components: [
    { name: 'Active WAL', location: 'disk', purpose: 'Makes dirty entries durable until they are flushed.' },
    { name: 'Memtable', location: 'ram', purpose: 'Dirty entries waiting for the next flush plus clean entries kept as a read cache.' },
    { name: 'Eviction policy', location: 'logic', purpose: 'Picks which clean entry to drop when the memtable is full: LRU by default, LFU or FIFO as alternatives.' },
    { name: 'SSTables', location: 'disk', purpose: 'Immutable files, sorted by key, one entry per key, named by the WAL sequence numbers they cover.' },
    { name: 'Offset map', location: 'ram', purpose: 'Still maps every key on disk to (table, offset).' },
  ],
  limitations: [
    { title: 'Duplicates across tables', body: 'Each table is duplicate-free on its own, but the same key can appear in several tables, and only the newest copy matters.' },
    { title: 'The table count keeps growing', body: 'Every flush adds a file, so the disk fills with small tables that overlap.' },
    { title: 'One RAM entry per key', body: 'The offset map still holds an entry for every key on disk, which won’t fit in memory at billions of keys.' },
  ],
  whyNext:
    'Every table is already sorted, so two of them can be combined in one linear pass, keeping only the newest version of each key. That is the merge step of merge sort.',
  notes: [
    {
      title: 'Why a dirty entry must never be evicted',
      body: 'Until it is flushed, a dirty entry’s value exists only in the WAL. If eviction removed it, the next read would miss the memtable and find an older value on disk, or nothing at all. This is not a rare corner case: in a write-heavy workload LRU would prefer exactly the keys written once and never read, which are the dirty ones. Limiting eviction to clean entries removes the problem completely.',
    },
    {
      title: 'A clean entry can never be stale',
      body: 'Every write goes through the memtable and replaces the entry for its key, so whatever the memtable holds is the newest value. A clean entry differs from a dirty one only in that a copy is already in an SSTable.',
    },
    {
      title: 'When every slot is dirty',
      body: 'Dirty entries can’t be evicted, so a memtable full of them could take no new keys. The store then flushes early, even though the WAL is not full yet, which turns the entries clean and evictable again.',
    },
    {
      title: 'Memtable and cache are usually separate',
      body: 'Many production engines keep the memtable (pending writes) and the read cache as two separate structures. Combining them with an explicit dirty or clean state, as here, gives the same safety in one structure.',
    },
    {
      title: 'Restarting',
      body: 'After a crash only the active WAL is replayed, so the memtable comes back with just the dirty entries. The clean entries were only a cache: their data is in SSTables, and they return as keys are read.',
    },
    {
      title: 'The numbers match the engine',
      body: 'Sizes, flush points and evictions follow the JavaScript engine’s demo run with walMaxBytes 128 and a 6-entry memtable. A WAL record is an 8-byte header (checksum and length) plus the entry; an SSTable entry is a 2-byte key length, the key, a type byte, a 4-byte value length and the value.',
    },
  ],
  asides: [
    {
      title: 'Small immutable files travel well',
      body: 'Because SSTables are small and never change after they are written, they can be copied to other machines in the background (replication) and different tables can live on different machines (partitioning). This is how the design starts to reach petabyte scale.',
    },
  ],
  requirements: {
    reads: { level: 'met', reason: 'Cached keys are answered from RAM; others take one offset lookup and one disk read.' },
    writes: { level: 'met', reason: 'One WAL append plus a RAM write; flushes write sequentially in large batches.' },
    durability: { level: 'met', reason: 'Dirty entries are in the WAL, clean ones in SSTables, and a WAL is deleted only after its table is on disk.' },
    unstructured: { level: 'met', reason: 'Values carry their own type and can change type on every write.' },
    scale: { level: 'partial', reason: 'Small immutable tables can be spread across machines, but the offset map still needs one RAM entry per key.' },
  },
  walkthroughs: [
    { id: 'flush', title: 'Flush the first WAL', operation: 'flush', summary: 'Collect, sort, write, mark clean, rotate the WAL and index the new table.', build: flushFirstWal },
    { id: 'evict', title: 'Eviction skips dirty entries', operation: 'insert', summary: 'Fill the memtable and watch LRU remove only clean entries until the second flush.', build: evictionSkipsDirty },
    { id: 'read', title: 'A read fills the cache', operation: 'read', summary: 'Read an evicted key from disk and cache it as a clean entry.', build: readFillsCache },
    { id: 'duplicates', title: 'Duplicates across tables', operation: 'flush', summary: 'Update iphone12 and flush again: it now lives in two tables.', build: duplicatesAcrossTables },
  ],
  snippets: S10_SNIPPETS,
};
