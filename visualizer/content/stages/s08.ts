import { putIphone12, readHit, readMiss, restart } from '@/engine/architectures/s08Memtable';
import { S08_SNIPPETS } from '../snippets/s08';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S08: StageContent = {
  ...STAGE_INDEX[8]!,
  summary:
    'Keep an in-memory copy of the active segment, called the memtable, so that reads of the freshest data never touch the disk.',
  problemDetail: [
    'Every read is a disk access, and that disk is shared with the compaction job. The keys written most recently are often the ones read next, yet even they cost a seek.',
  ],
  change: [
    'Add a memtable: a hash map in RAM holding the contents of the active segment. The active segment may contain several records for one key, but the memtable keeps one entry per key, always the latest, because setting a key in a hash map replaces the old value.',
    'Every put now writes to the active segment (for durability), the memtable (for fast reads) and the offset map.',
    'A read checks the memtable first. Anything found there is guaranteed to be the newest value, because the active segment always holds the newest writes.',
  ],
  components: [
    { name: 'Active segment', location: 'disk', purpose: 'Durability: the write survives a crash.' },
    { name: 'Memtable', location: 'ram', purpose: 'The active segment’s data as a hash map: one entry per key, newest value.' },
    { name: 'Offset map', location: 'ram', purpose: 'key → (segment, offset) for everything on disk.' },
    { name: 'Closed segments', location: 'disk', purpose: 'Older data, read-only and compacted in the background.' },
  ],
  limitations: [
    { title: 'Three writes per put', body: 'One append to disk plus two RAM writes, one of which turns out to be unnecessary.' },
    { title: 'More RAM in use', body: 'The memtable holds the active segment’s keys and values on top of the offset map.' },
    { title: 'Restart rebuilds two structures', body: 'The memtable is replayed from the active segment and the map from every segment.' },
    { title: 'One RAM entry per key', body: 'The offset map still grows with the total number of keys.' },
  ],
  whyNext:
    'Look at the third write. An offset-map entry for a key in the active segment is never used, because the memtable answers every read of that key first. The next stage stops writing it.',
  notes: [
    {
      title: 'The hit ratio',
      body: 'The hit ratio is the fraction of reads answered from the memtable without touching the disk. It depends on the workload: the more reads ask for recently written keys, the higher it is.',
    },
  ],
  asides: [
    {
      title: 'A cache that is never stale',
      body: 'An ordinary cache can hold an out-of-date copy and needs invalidation rules. The memtable can’t fall behind, because every write goes into it as part of the put itself.',
    },
  ],
  requirements: {
    reads: { level: 'met', reason: 'Fresh keys come straight from RAM; others take one RAM lookup and one disk read.' },
    writes: { level: 'partial', reason: 'Still one sequential append, but three writes per put.' },
    durability: { level: 'met', reason: 'The segment on disk is written before the put returns; RAM can be rebuilt from it.' },
    unstructured: { level: 'met', reason: 'Records can be any size and change type freely.' },
    scale: { level: 'partial', reason: 'Segments are small files, but the offset map still holds one entry per key.' },
  },
  walkthroughs: [
    { id: 'put', title: 'Put iphone12 = 4.9', operation: 'update', summary: 'Three writes: the active segment, the memtable and the offset map.', build: putIphone12 },
    { id: 'hit', title: 'Read iphone12', operation: 'read', summary: 'A memtable hit answers from RAM.', build: readHit },
    { id: 'miss', title: 'Read airpods', operation: 'read', summary: 'A memtable miss falls back to the map and one disk read.', build: readMiss },
    { id: 'restart', title: 'Restart', operation: 'recover', summary: 'Rebuild the memtable from the active segment and the map from every segment.', build: restart },
  ],
  snippets: S08_SNIPPETS,
};
