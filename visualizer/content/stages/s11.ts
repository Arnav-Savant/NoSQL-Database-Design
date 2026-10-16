import { mergeTree, mergeTwoTables, newerWins } from '@/engine/architectures/s11MergeCompaction';
import { S11_SNIPPETS } from '../snippets/s11';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S11: StageContent = {
  ...STAGE_INDEX[11]!,
  summary:
    'Combine sorted SSTables into one larger sorted SSTable, keeping only the newest version of each key, the same way merge sort combines two sorted arrays.',
  problemDetail: [
    'Each SSTable is duplicate-free on its own, but the same key can appear in several tables, and only the newest copy is ever read.',
    'Every flush adds a table, so the number of files, and the wasted space, grow without limit.',
  ],
  change: [
    'A background compactor merges tables. It walks two adjacent tables with two pointers, as in the merge step of merge sort, always emitting the smaller key.',
    'When both pointers see the same key, the entry from the newer table is kept and the older one is discarded.',
    'The output is named by the range of sequence numbers it covers, for example sst-000001-000002.sst, and the inputs are deleted only after it is safely on disk.',
    'In the engine, compaction runs whenever a flush brings the table count to a trigger (3 in the demo), merging the two oldest tables.',
  ],
  components: [
    { name: 'SSTables', location: 'disk', purpose: 'Sorted, immutable inputs and outputs of each merge.' },
    { name: 'Merge buffers and pointers', location: 'ram', purpose: 'The current entry of each input and the two-pointer walk.' },
    { name: 'Compactor', location: 'logic', purpose: 'Chooses tables to merge, writes the output and swaps it in for the inputs.' },
    { name: 'Offset map', location: 'ram', purpose: 'Still one entry per key; entries that pointed into an input move to the output.' },
  ],
  limitations: [
    { title: 'One RAM entry per key', body: 'The offset map still remembers every key on disk, and every merge has to rewrite the entries of the keys it moved.' },
    { title: 'Extra disk work', body: 'Compaction reads and rewrites data that is already on disk, and briefly needs room for both the inputs and the output.' },
  ],
  whyNext:
    'Each key now has at most one entry per table and there are few tables. The tables are sorted, so a key’s position can be found by searching instead of being remembered: the offset map can go.',
  notes: [
    {
      title: 'Merging is linear and sequential',
      body: 'Each comparison emits one entry and moves at least one pointer, so merging tables of n and m entries takes at most n + m steps. Both inputs are read front to back and the output is written front to back, which is the access pattern disks handle best.',
    },
    {
      title: 'Real compactors stream',
      body: 'A merge only needs the current entry of each input, so real compactors read the inputs block by block instead of loading whole tables into RAM. The tables here are tiny, so the buffers show them in full.',
    },
    {
      title: 'Crashing mid-merge',
      body: 'If a crash happens after the output is written but before the inputs are deleted, both exist on restart. Any table whose range lies inside another table’s range, such as sst-1-1 inside sst-1-2, is a leftover input and is deleted.',
    },
    {
      title: 'Why the name carries a range',
      body: 'Reads check newer tables before older ones. A merged output given a fresh, higher number would look newer than tables that really hold newer data, and old values would win. Named sst-1-2, it still sorts as older than sst-3-3.',
    },
    {
      title: 'Writes are never blocked',
      body: 'Compaction only reads immutable SSTables and writes a new file. Writes go to the WAL and the memtable, which compaction never touches, and reads keep using the old tables until the new one is in place.',
    },
    {
      title: 'The walkthroughs and the engine',
      body: 'The first merge uses the engine demo’s own first compaction: sst-1 and sst-2, which happen to share no keys. The demo’s delete of watch is left out until stage 14, and the merge tree lets four tables pile up, which the engine’s trigger of 3 would not allow.',
    },
  ],
  asides: [],
  requirements: {
    reads: { level: 'met', reason: 'Fewer tables and no duplicates; a disk read is still one offset lookup and one seek.' },
    writes: { level: 'met', reason: 'Compaction runs in the background and never blocks the WAL or the memtable.' },
    durability: { level: 'met', reason: 'Inputs are deleted only after the output is on disk.' },
    unstructured: { level: 'met', reason: 'Entries are copied as they are, whatever their type.' },
    scale: { level: 'partial', reason: 'Tables stay bounded in number, but the offset map still holds every key in RAM.' },
  },
  walkthroughs: [
    { id: 'merge', title: 'Merge two tables', operation: 'compact', summary: 'The engine’s first compaction: sst-1 and sst-2 become sst-1-2, one comparison at a time.', build: mergeTwoTables },
    { id: 'newer-wins', title: 'Equal keys: newer wins', operation: 'compact', summary: 'Merge sst-1-2 with sst-3-3, where five keys appear in both.', build: newerWins },
    { id: 'tree', title: 'The merge tree', operation: 'compact', summary: 'Four tables become two, then one, building bottom up.', build: mergeTree },
  ],
  snippets: S11_SNIPPETS,
};
