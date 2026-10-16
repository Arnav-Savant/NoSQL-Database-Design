import { compactLiveFile, readDuringCompaction } from '@/engine/architectures/s06SingleLogCompaction';
import { S06_SNIPPETS } from '../snippets/s06';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S06: StageContent = {
  ...STAGE_INDEX[6]!,
  summary:
    'Add a background job that removes stale records from the write-ahead log. Done on the single file that is also receiving writes, it blocks puts, shifts every later record and forces the offset map to be rewritten.',
  problemDetail: [
    'Every update leaves a stale record behind: an older version of a key that nothing points to any more. A key updated 1,000 times costs 1,000 records on disk, of which only one is useful.',
    'With a steady stream of updates the log can grow to many times the size of the live data.',
  ],
  change: [
    'Run compaction: a background job that periodically scans the log and removes stale records, keeping only the latest record for each key.',
    'Here the job works on the one and only log file, the same file that every put appends to.',
  ],
  components: [
    { name: 'Write-ahead log (single file)', location: 'disk', purpose: 'Every record in arrival order, stale ones included. Puts append here and compaction rewrites it.' },
    { name: 'Offset map', location: 'ram', purpose: 'Hash map from key to the byte offset of its latest record.' },
    { name: 'Compaction job', location: 'logic', purpose: 'Removes stale records from the log and fixes the offsets of everything it moves.' },
  ],
  limitations: [
    { title: 'Writes are blocked', body: 'Appends go to the end of the file, and the end moves while the job rewrites it, so puts wait until the job is done.' },
    { title: 'The index churns', body: 'Removing one record shifts every record after it, and each shifted key needs its map entry rewritten.' },
    { title: 'Reads must coordinate', body: 'An offset read from the map can go stale before the disk read happens, so reads have to wait for or retry around the job.' },
    { title: 'Too big for one pass', body: 'A huge file can’t be rewritten at once, so the job has to work chunk by chunk and keep everything consistent after each chunk.' },
  ],
  whyNext:
    'The job already wants to work chunk by chunk, and it only gets in the way of writes because both touch the same file. So split the log into many small files from the start: one receives writes, and the others can be compacted without disturbing it.',
  notes: [
    {
      title: 'The append-only rule is broken',
      body: 'Rewriting the log in place modifies bytes that were already written. The append-only rule from stage 4, that existing bytes never change, is what made appends safe and confined crash damage to the last record.',
    },
  ],
  asides: [
    {
      title: 'Why not leave gaps instead of shifting?',
      body: 'The job could mark the stale bytes as free instead of moving records left, which keeps offsets stable. The file then never shrinks, and reusing the gaps means writing into the middle of the file, and fitting new records into gaps of the wrong size, which are the in-place update problems of stages 2 and 3.',
    },
  ],
  requirements: {
    reads: { level: 'met', reason: 'Still one hash lookup in RAM and one disk read, when the job isn’t moving bytes.' },
    writes: { level: 'partial', reason: 'Appends are cheap, but they wait whenever compaction rewrites the file.' },
    durability: { level: 'met', reason: 'The log on disk still holds every acknowledged write.' },
    unstructured: { level: 'met', reason: 'Records can be any size and change type freely.' },
    scale: { level: 'unmet', reason: 'One huge file, one map entry per key, one machine.' },
  },
  walkthroughs: [
    { id: 'compact', title: 'Compact the live file', operation: 'compact', summary: 'Remove the stale macbook record and watch everything after it move.', build: compactLiveFile },
    { id: 'read', title: 'Read during compaction', operation: 'read', summary: 'A read holds an offset that the job shifts underneath it.', build: readDuringCompaction },
  ],
  snippets: S06_SNIPPETS,
};
