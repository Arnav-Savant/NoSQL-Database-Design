import { compactClosedSegment, readFromClosedSegment, writesFillSegments } from '@/engine/architectures/s07LogSegments';
import { S07_SNIPPETS } from '../snippets/s07';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S07: StageContent = {
  ...STAGE_INDEX[7]!,
  summary:
    'Split the write-ahead log into many small files called segments. Only the newest segment receives writes, so compaction can rewrite any of the others without ever getting in a writer’s way.',
  problemDetail: [
    'Compacting the single live log blocks writes, shifts records, forces map rewrites, and has to be done in chunks anyway because the file is so large.',
  ],
  change: [
    'The log becomes a numbered series of segments: wal-000001.log, wal-000002.log, and so on. Each has a size limit; real systems use tens of megabytes, this example uses 40 bytes so the files stay small.',
    'Only the newest segment, the active segment, accepts writes. When the next record wouldn’t fit, the active segment is closed (made read-only for good) and a new one is created and becomes active.',
    'The offset map now stores which segment and which offset: key → (segment, offset), shown as “wal-2 @ 9”.',
  ],
  components: [
    { name: 'Active segment', location: 'disk', purpose: 'The one segment that receives every new append.' },
    { name: 'Closed segments', location: 'disk', purpose: 'Older segments: read-only, and therefore safe to compact.' },
    { name: 'Offset map', location: 'ram', purpose: 'Hash map from key to the segment and offset of its latest record.' },
    { name: 'Compaction job', location: 'logic', purpose: 'Rewrites closed segments without their stale records.' },
  ],
  limitations: [
    { title: 'Every read goes to disk', body: 'Even the key written a millisecond ago is read back with a disk seek.' },
    { title: 'Compaction competes with reads', body: 'The job’s sequential reads and writes share the disk with every lookup, so reads slow down while it runs.' },
    { title: 'One RAM entry per key', body: 'The offset map still grows with the number of keys.' },
  ],
  whyNext:
    'Writes are no longer disturbed by compaction, but reads still are: every read is a disk access on a disk busy with compaction. The freshest data, in the active segment, is also the most likely to be read, so keep a copy of it in RAM.',
  notes: [
    {
      title: 'Crash damage stays small',
      body: 'Only the active segment is ever written, so a torn record after a crash can only appear at the end of that one file. Closed segments are never modified once closed.',
    },
  ],
  asides: [
    {
      title: 'Segments are easy to move',
      body: 'A closed segment is a small, immutable file. It can be copied, backed up or shipped to another machine without coordinating with writers, which matters later when data has to spread across machines.',
    },
  ],
  requirements: {
    reads: { level: 'partial', reason: 'One RAM lookup and one disk read, but the disk is shared with compaction.' },
    writes: { level: 'met', reason: 'Appends go to the active segment and never wait for compaction.' },
    durability: { level: 'met', reason: 'Every write is in a segment on disk before it is acknowledged.' },
    unstructured: { level: 'met', reason: 'Records can be any size and change type freely.' },
    scale: { level: 'partial', reason: 'Small immutable files could spread across machines, but the map still holds one entry per key.' },
  },
  walkthroughs: [
    { id: 'fill', title: 'Writes fill segments', operation: 'rollover', summary: 'Write the dataset with a 40-byte limit and watch segments roll over.', build: writesFillSegments },
    { id: 'read', title: 'Read airpods', operation: 'read', summary: 'Read airpods from a closed segment.', build: readFromClosedSegment },
    { id: 'compact', title: 'Compact while writing', operation: 'compact', summary: 'Rewrite wal-000001.log while a put appends to the active segment.', build: compactClosedSegment },
  ],
  snippets: S07_SNIPPETS,
};
