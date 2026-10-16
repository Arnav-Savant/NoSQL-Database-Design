import { deleteWatch, mergeWithOldest, mergeWithoutOldest, readWatch } from '@/engine/architectures/s14Tombstones';
import { S14_SNIPPETS } from '../snippets/s14';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S14: StageContent = {
  ...STAGE_INDEX[14]!,
  summary:
    'SSTables are immutable, so a delete can’t remove anything from them. Instead a delete writes a tombstone: a special entry that says “this key is deleted”. It hides every older value, and compaction removes it once that is safe.',
  problemDetail: [
    'A key can live in several SSTables, and none of them can be edited. Removing the key from the memtable alone is not enough: the next read would miss in RAM, fall through to an older table and find the old value.',
  ],
  change: [
    'delete(key) is a write. It appends a tombstone record for the key to the WAL and stores the tombstone in the memtable as a dirty entry, exactly like a put.',
    'A tombstone is its own entry type, not a value. A read that finds one, in the memtable or in a table, stops and returns not found. Because tables are checked newest first, the tombstone hides every older value of the key.',
    'Compaction eventually removes both the old values and the tombstone itself, but only when the merge includes the oldest table, so that no older copy of the key can survive anywhere.',
  ],
  components: [
    { name: 'Tombstone', location: 'disk', purpose: 'An entry that marks a key as deleted at a point in time. It lives in the WAL, the memtable and SSTables like any other entry.' },
    { name: 'Memtable', location: 'ram', purpose: 'Holds the tombstone as a dirty entry until the next flush writes it into a table.' },
    { name: 'Compactor', location: 'logic', purpose: 'Merges tables; drops a tombstone only when no older table could still contain the key.' },
  ],
  limitations: [
    { title: 'Tombstones take space', body: 'A deleted key still costs an entry, in every table it reaches, until a merge with the oldest table removes it.' },
    { title: 'Missing keys are still expensive', body: 'A read for a key that is in no table, or was deleted long ago, still reads one block from every table before giving up.' },
  ],
  whyNext:
    'Reads for missing keys pay one block read per table. The next stage gives every table a small bit array in RAM that rules most of those tables out without touching the disk.',
  notes: [
    {
      title: 'A distinct entry type, not null',
      body: 'Using null as the delete marker would make it impossible to store a real null value. In the engines the entry’s type byte is 4 for a tombstone and its value length is 0, so the watch tombstone is a 20-byte WAL record: 8 bytes of checksum and length plus a 12-byte entry.',
    },
    {
      title: 'The drop rule',
      body: 'Drop a tombstone only when no live table is older than the merge’s older input. The engines always merge the two oldest tables, so a tombstone is dropped as soon as it reaches a merge with the oldest table.',
    },
  ],
  asides: [
    {
      title: 'Deletes in distributed stores',
      body: 'Replicated LSM databases keep tombstones for a grace period even when the drop rule allows removing them, so that a replica that missed the delete can still learn about it. A tombstone removed too early lets the old value spread back from that replica.',
    },
  ],
  requirements: {
    reads: { level: 'partial', reason: 'A missing or long-deleted key still costs one block read per table.' },
    writes: { level: 'met', reason: 'A delete is one WAL append plus one RAM update, like a put.' },
    durability: { level: 'met', reason: 'The tombstone is in the WAL before the delete returns.' },
    unstructured: { level: 'met', reason: 'A tombstone is a separate entry type, so null stays a valid value.' },
    scale: { level: 'partial', reason: 'Immutable tables can be spread out, but every extra table adds a block read for an absent key.' },
  },
  walkthroughs: [
    { id: 'delete', title: 'Delete watch', operation: 'delete', summary: 'Append a tombstone to the WAL and store it dirty in the memtable.', build: deleteWatch },
    { id: 'read', title: 'Read watch', operation: 'read', summary: 'The memtable tombstone answers not found; the 4.4 on disk is never read.', build: readWatch },
    { id: 'merge-oldest', title: 'Merge that includes the oldest table', operation: 'compact', summary: 'The tombstone wins over 4.4, then is dropped as well.', build: mergeWithOldest },
    { id: 'merge-skip', title: 'Merge that skips the oldest table', operation: 'compact', summary: 'Dropping the tombstone here would bring watch = 4.4 back, so it is kept.', build: mergeWithoutOldest },
  ],
  snippets: S14_SNIPPETS,
};
