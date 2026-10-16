import { crashAndRebuild, putNewKey, readKey, updateMacbook } from '@/engine/architectures/s05HashIndex';
import { S05_SNIPPETS } from '../snippets/s05';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S05: StageContent = {
  ...STAGE_INDEX[5]!,
  summary:
    'Keep the append-only file for writes, and add a hash map in RAM that remembers where each key’s latest record is. The append-only file now has its proper name: the write-ahead log (WAL).',
  problemDetail: [
    'Appending made writes as cheap as a disk allows, but finding a key means scanning the whole file, and the scan can’t stop early because a newer version might come later.',
  ],
  change: [
    'An offset map in RAM stores, for each key, the byte offset of its latest record in the log. An offset is a position in a file, counted in bytes from the start.',
    'A read becomes one hash lookup in memory plus one disk read. A write becomes one append plus one memory update.',
  ],
  components: [
    { name: 'Write-ahead log (WAL)', location: 'disk', purpose: 'Append-only file holding every write in order. It is the source of truth that survives a crash.' },
    { name: 'Offset map', location: 'ram', purpose: 'Hash map from key to the offset of its latest record in the WAL.' },
  ],
  limitations: [
    { title: 'The log grows forever', body: 'Every update leaves a stale record behind. A key updated a thousand times costs a thousand records.' },
    { title: 'One RAM entry per key', body: 'A billion keys means a billion map entries, which won’t fit in the memory of one machine.' },
    { title: 'One machine', body: 'There is a single file and a single map, with no way to split them across machines.' },
    { title: 'Slow restarts', body: 'Rebuilding the map after a crash means scanning the whole log, and the log keeps growing.' },
  ],
  whyNext:
    'The most pressing problem is the ever-growing log. The obvious fix is a background job that removes stale records. The next stage tries exactly that, on this single file.',
  notes: [
    {
      title: 'How much faster is RAM?',
      body: 'A RAM access takes around 100 nanoseconds. A random seek on a spinning disk takes around 10 milliseconds, about 100,000 times longer. That gap is why the lookup happens in RAM and the disk is touched only once.',
    },
  ],
  asides: [
    {
      title: 'Relational databases log first too',
      body: 'Before changing data pages or B+ tree indexes, a relational database writes the change to a sequential log. After a crash it replays the log, which lets the slower, scattered page updates happen later and in batches.',
    },
  ],
  requirements: {
    reads: { level: 'met', reason: 'One hash lookup in RAM plus one disk read.' },
    writes: { level: 'met', reason: 'One sequential append plus one RAM update.' },
    durability: { level: 'met', reason: 'The WAL on disk survives crashes; the map can always be rebuilt from it.' },
    unstructured: { level: 'met', reason: 'Records can be any size and change type freely.' },
    scale: { level: 'unmet', reason: 'One map entry per key in RAM, and everything on one machine.' },
  },
  walkthroughs: [
    { id: 'put', title: 'Put a new key', operation: 'insert', summary: 'Append pixel8 = 4.3 and record its offset.', build: putNewKey },
    { id: 'update', title: 'Update macbook', operation: 'update', summary: 'Append a new version and move the map entry.', build: updateMacbook },
    { id: 'read', title: 'Read iphone12', operation: 'read', summary: 'One lookup in RAM, one seek on disk.', build: readKey },
    { id: 'recover', title: 'Crash and rebuild', operation: 'recover', summary: 'Lose the map, then rebuild it by replaying the log.', build: crashAndRebuild },
  ],
  snippets: S05_SNIPPETS,
};
