import { putKindle, readMemtableFirst, segmentCloses } from '@/engine/architectures/s09DeferredOffsetMap';
import { S09_SNIPPETS } from '../snippets/s09';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S09: StageContent = {
  ...STAGE_INDEX[9]!,
  summary:
    'Stop writing the offset map on every put. A put now writes only the active segment and the memtable; the map learns about a segment once, in one bulk update, when that segment closes.',
  problemDetail: [
    'Each put writes the segment, the memtable and the offset map, but the map entries for keys in the active segment are never read: the memtable answers those reads first.',
  ],
  change: [
    'A put writes to the active segment (durability) and the memtable (fast reads). That is two writes instead of three.',
    'The offset map covers closed segments only. When the active segment closes, every record in it is written into the map in a single bulk update, and the memtable starts empty for the new segment.',
    'A read must check the memtable before the map. The map can hold an older location for a key that was rewritten in the active segment, and the memtable hides it.',
  ],
  components: [
    { name: 'Active segment', location: 'disk', purpose: 'Durability for every put.' },
    { name: 'Memtable', location: 'ram', purpose: 'Answers reads for every key written to the active segment.' },
    { name: 'Offset map', location: 'ram', purpose: 'key → (segment, offset) for closed segments only, updated in bulk at roll-over.' },
    { name: 'Closed segments', location: 'disk', purpose: 'Older data in arrival order, duplicates included.' },
  ],
  limitations: [
    { title: 'A burst of work at roll-over', body: 'The bulk update happens all at once when a segment closes, instead of being spread across puts.' },
    { title: 'Closed segments keep duplicates', body: 'A key written several times while a segment was active is stored several times in it.' },
    { title: 'Data on disk is unsorted', body: 'Records sit in arrival order, so nothing on disk can be searched without the map.' },
    { title: 'One RAM entry per key', body: 'The offset map still grows with the total number of keys.' },
  ],
  whyNext:
    'At the moment a segment closes, the memtable already holds a clean, duplicate-free version of it with the newest value for each key. Instead of keeping the raw segment with its stale records, write that version to disk, sorted by key. That file is an SSTable.',
  notes: [
    {
      title: 'Fresh reads are no slower',
      body: 'Deferring the map costs nothing on reads: keys in the active segment were always answered by the memtable, and keys in closed segments are always in the map.',
    },
  ],
  asides: [
    {
      title: 'Batching is a recurring trick',
      body: 'Doing many small updates as one large one appears throughout storage engines: group commits batch log writes, and bulk index builds sort once instead of inserting one key at a time.',
    },
  ],
  requirements: {
    reads: { level: 'met', reason: 'Fresh keys from RAM; others take one map lookup and one disk read.' },
    writes: { level: 'met', reason: 'Two writes per put: one sequential append and one RAM write.' },
    durability: { level: 'met', reason: 'Every put is in the active segment on disk; RAM can be rebuilt from the segments.' },
    unstructured: { level: 'met', reason: 'Records can be any size and change type freely.' },
    scale: { level: 'partial', reason: 'Segments are small files, but the map still holds one entry per key.' },
  },
  walkthroughs: [
    { id: 'put', title: 'Put kindle = "Paperwhite"', operation: 'update', summary: 'Two writes; the offset map is left alone.', build: putKindle },
    { id: 'read', title: 'Memtable first, then the map', operation: 'read', summary: 'A hit that hides an old map entry, then a miss served from disk.', build: readMemtableFirst },
    { id: 'close', title: 'The segment closes', operation: 'rollover', summary: 'Open a new segment and add the closed one’s keys to the map in one step.', build: segmentCloses },
  ],
  snippets: S09_SNIPPETS,
};
