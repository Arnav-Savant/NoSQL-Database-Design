import { keyBeforeFirstBlock, keyNotInTable, readThroughSparseIndex } from '@/engine/architectures/s13SparseIndex';
import { S13_SNIPPETS } from '../snippets/s13';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S13: StageContent = {
  ...STAGE_INDEX[13]!,
  summary:
    'Split each SSTable into fixed-size blocks and keep a tiny index of where each block starts. A lookup then reads exactly one block per table, and finishes the search in RAM.',
  problemDetail: [
    'Binary-searching a whole SSTable on disk jumps from block to block: several random reads per table, for every table checked.',
  ],
  change: [
    'A disk reads data in fixed-size blocks anyway. Real systems use about 4 KiB; the demo configuration uses 64 bytes so a small table still has several blocks.',
    'When an SSTable is written, its sorted entries are packed into blocks. A new block starts when the next entry would not fit.',
    'Each table gets a sparse index: the first key and the byte offset of every block. It is sparse because it has one entry per block, not one per key, so it stays small enough to keep in RAM. It is stored in the table file and loaded once when the table is opened.',
    'A lookup searches the sparse index in RAM for the last block whose first key is ≤ the key, reads that one block from disk, and binary-searches inside it in RAM.',
  ],
  components: [
    { name: 'Data blocks', location: 'disk', purpose: 'The table’s sorted entries, in chunks of at most 64 bytes here.' },
    { name: 'Sparse index', location: 'ram', purpose: 'First key and offset of every block of every table.' },
    { name: 'Block buffer', location: 'ram', purpose: 'The one block read from disk, binary-searched in memory.' },
    { name: 'Memtable', location: 'ram', purpose: 'Newest data and read cache, checked before any table.' },
  ],
  limitations: [
    { title: 'Absent keys still cost a read per table', body: 'A key that falls inside a table’s range but isn’t in it still costs one block read in that table before the miss is known.' },
    { title: 'Every table is still checked', body: 'A key held only in the oldest table, or in no table, means visiting every table in turn.' },
  ],
  whyNext: 'An absent key still costs one block read in every table. A cheap way to say “definitely not in this table” without touching the disk would remove those reads.',
  notes: [
    {
      title: 'Why not one block per table?',
      body: 'A freshly flushed table might fit in a single block, but tables produced by compaction are larger and span many blocks. The sparse index works at any table size: its cost grows with the number of blocks, not keys.',
    },
    {
      title: 'The blocks are the engine’s',
      body: 'Blocks are packed exactly as the engine packs them, using its entry sizes: sst-1-2 has 4 blocks (62, 46, 61 and 20 bytes) and sst-3-3 has 2. The engine’s full-size tables carry a Bloom filter too, which arrives in stage 15.',
    },
  ],
  asides: [],
  requirements: {
    reads: { level: 'partial', reason: 'At most one block read per table, but every table may still be checked.' },
    writes: { level: 'met', reason: 'Unchanged: building blocks and the index happens during the sequential flush.' },
    durability: { level: 'met', reason: 'Unchanged: the WAL and immutable SSTables hold every write.' },
    unstructured: { level: 'met', reason: 'Values carry their own type.' },
    scale: { level: 'partial', reason: 'RAM grows with blocks, not keys; still one machine.' },
  },
  walkthroughs: [
    { id: 'read', title: 'Read a key through the sparse index', operation: 'read', summary: 'iphone11: one block read in sst-3-3, one in sst-1-2, found.', build: readThroughSparseIndex },
    { id: 'absent', title: 'A key not in the table', operation: 'read', summary: 'nokia: one block read per table, then not found.', build: keyNotInTable },
    { id: 'before', title: 'A key before the first block', operation: 'read', summary: 'aardvark: the sparse indexes rule it out with no disk read.', build: keyBeforeFirstBlock },
  ],
  snippets: S13_SNIPPETS,
};
