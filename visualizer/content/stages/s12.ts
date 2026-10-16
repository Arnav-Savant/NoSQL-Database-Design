import { newestFirstWins, readThroughTables } from '@/engine/architectures/s12BinarySearchTables';
import { S12_SNIPPETS } from '../snippets/s12';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S12: StageContent = {
  ...STAGE_INDEX[12]!,
  summary: 'Every SSTable is sorted, so the per-key offset map can go. A read that misses the memtable binary-searches the tables instead, newest first.',
  problemDetail: [
    'The offset map keeps one RAM entry for every key on disk. With billions of keys it no longer fits in the memory of one machine.',
    'Every merge also has to rewrite the map entries of the keys it moved.',
  ],
  change: [
    'Remove the offset map entirely.',
    'To read a key that isn’t in the memtable, check the SSTables from newest to oldest and binary-search each one. Binary search compares the key with the middle entry and throws away the half that can’t hold it, so a table of n entries needs about log₂(n) comparisons instead of one hash lookup.',
    'Stop at the first table that has the key. Newer tables hold newer values, so the first match is the latest value.',
  ],
  components: [
    { name: 'Memtable', location: 'ram', purpose: 'Newest data and the read cache, checked first.' },
    { name: 'SSTables', location: 'disk', purpose: 'Sorted and immutable, searched from newest to oldest.' },
    { name: 'Offset map', location: 'logic', purpose: 'Removed: nothing in RAM grows with the number of keys any more.' },
  ],
  limitations: [
    { title: 'Many random reads per table', body: 'Each probe of the binary search jumps to a new position in the file, usually a different disk block, so one table can cost several random reads.' },
    { title: 'Every table may be searched', body: 'A key held only in the oldest table, or in no table at all, costs a full binary search in every table.' },
  ],
  whyNext: 'The search must be narrowed so that each table costs one disk read, not log₂(n) of them.',
  notes: [
    {
      title: 'A binary search is not one disk read',
      body: 'Every probe reads the entry at a new middle position, which usually lies in a different disk block than the previous one. A lookup in a table of a million entries takes about 20 probes, and each can be its own random read.',
    },
    {
      title: 'Order is what makes reads correct',
      body: 'The same key can be in several tables. Checking tables newest first and stopping at the first match returns the latest value; checking them in any other order can return an outdated one.',
    },
    {
      title: 'Variable-size entries',
      body: 'Entries have different lengths, so “the entry at position mid” can’t be computed from its index alone. Real tables solve this with block-level structure, which the next stage adds; the walkthroughs here count probes by position to show the shape of the search.',
    },
  ],
  asides: [],
  requirements: {
    reads: { level: 'partial', reason: 'No offset map, but each table costs about log₂(n) random disk reads.' },
    writes: { level: 'met', reason: 'Unchanged: one WAL append and a RAM write.' },
    durability: { level: 'met', reason: 'Unchanged: the WAL and immutable SSTables hold every acknowledged write.' },
    unstructured: { level: 'met', reason: 'Values carry their own type.' },
    scale: { level: 'partial', reason: 'RAM no longer grows with the key count, but everything is still on one machine.' },
  },
  walkthroughs: [
    { id: 'read', title: 'Read iphone11', operation: 'read', summary: 'Binary-search sst-3-3, miss, then binary-search sst-1-2 and find it.', build: readThroughTables },
    { id: 'order', title: 'Read ipad: order matters', operation: 'read', summary: 'The newest table answers first; oldest first would return a stale value.', build: newestFirstWins },
  ],
  snippets: S12_SNIPPETS,
};
