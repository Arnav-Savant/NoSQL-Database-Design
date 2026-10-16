import { pointerRead, pointerUpdate } from '@/engine/architectures/s03PointerSplitting';
import { S03_SNIPPETS } from '../snippets/s03';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S03: StageContent = {
  ...STAGE_INDEX[3]!,
  summary:
    'When a new value doesn’t fit its slot, write what fits, then a pointer to where the rest is stored. The neighbouring record is never touched, but one value can now be scattered across the disk.',
  problemDetail: [
    'In the naive key-value file, a value that grows spills into the next record and destroys it. Updating macbook to "Apple" turned the key ipad into "epad".',
  ],
  change: [
    'Each value slot is still 4 bytes. When a value doesn’t fit, the last 2 bytes of the slot become a pointer: a small address saying “the rest of this value is over there”.',
    'The bytes that don’t fit are written to free space elsewhere in the file, far from the record. The result is a linked list, stored on disk.',
  ],
  components: [
    { name: 'Data file', location: 'disk', purpose: 'Records with fixed 4-byte value slots, exactly as before.' },
    { name: 'Pointer', location: 'disk', purpose: 'Two bytes inside a slot holding the address of the rest of the value.' },
    { name: 'Overflow area', location: 'disk', purpose: 'Free space far from the records, where bytes that didn’t fit are written.' },
  ],
  limitations: [
    { title: 'Reads follow pointers', body: 'Every fragment of a value costs a random seek, and disks are much slower at random access than at sequential access.' },
    { title: 'Values fragment over time', body: 'A value that grows several times becomes a chain of pieces, with one more seek per link.' },
    { title: 'Free space must be managed', body: 'Something has to track which parts of the overflow area are free, and reclaim pieces that are no longer used.' },
    { title: 'Finding a key is still a scan', body: 'Nothing here helps locate a key: every read still walks the file byte by byte.' },
  ],
  whyNext:
    'Both the corruption of the previous stage and the fragmentation of this one come from the same habit: rewriting a value where it already sits. The next stage stops editing in place altogether.',
  notes: [
    {
      title: 'Disks favour sequential access',
      body: 'Reading the next block is cheap. Seeking to an unrelated location costs a head movement on a spinning disk and a separate request on an SSD. A design that turns one logical read into several scattered physical reads works against the hardware.',
    },
  ],
  asides: [],
  requirements: {
    reads: { level: 'unmet', reason: 'Still a linear scan to find the key, plus a random seek per fragment.' },
    writes: { level: 'partial', reason: 'Updates no longer corrupt neighbours, but each one may need a seek to the overflow area.' },
    durability: { level: 'met', reason: 'Every byte, including the spilled ones, lives on disk.' },
    unstructured: { level: 'partial', reason: 'Values can grow, but only by fragmenting across the disk.' },
    scale: { level: 'unmet', reason: 'One file on one machine.' },
  },
  walkthroughs: [
    { id: 'update', title: 'Update macbook to "Apple"', operation: 'update', summary: 'Write "Ap", spill "ple" to offset 60000, and link them with a pointer.', build: pointerUpdate },
    { id: 'read', title: 'Read macbook', operation: 'read', summary: 'Scan to the key, follow the pointer with a random seek, and combine the pieces.', build: pointerRead },
  ],
  snippets: S03_SNIPPETS,
};
