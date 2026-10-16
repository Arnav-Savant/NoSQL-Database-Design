import { buildFilter, checkAbsentKey, falsePositive, falsePositiveRate, filterExample, percent, readWithFilters } from '@/engine/architectures/s15BloomFilters';
import { S15_SNIPPETS } from '../snippets/s15';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

const { table, n, m, k } = filterExample();
const doubled = 2 * n;

export const S15: StageContent = {
  ...STAGE_INDEX[15]!,
  summary:
    'Give every SSTable a small Bloom filter: a bit array in RAM that answers “is this key possibly in the table?”. A “no” is always correct, so most tables that don’t hold the key are skipped without any disk read.',
  problemDetail: [
    'A read for a key that is not in a table still reads one block from that table before it can move on. A key that exists nowhere, or was deleted long ago, pays one disk read per table.',
  ],
  change: [
    'A Bloom filter is an array of m bits, all 0 at first, plus k hash functions that each map a key to a bit position from 0 to m − 1.',
    'Adding a key sets its k bits to 1. Checking a key reads its k bits: if any is 0 the key is definitely not in the table; if all are 1 it is possibly there. Those bits may have been set by other keys, which is a false positive. There are never false negatives.',
    'Each table builds its filter when it is written, stores it in the file and loads it into RAM once. A read asks the filter before the sparse index, and reads a block only on a “maybe”.',
  ],
  components: [
    { name: 'Bloom filter (one per table)', location: 'ram', purpose: 'Answers “definitely not here” or “maybe here” without a disk read. Stored in the table file, loaded once.' },
    { name: 'Sparse index', location: 'ram', purpose: 'On a “maybe”, picks the one block that could hold the key.' },
    { name: 'SSTables', location: 'disk', purpose: 'Data blocks, then the sparse index, then the Bloom filter, then a footer.' },
  ],
  limitations: [
    { title: 'False positives still cost a read', body: 'A “maybe” for a key that isn’t there costs one wasted block read before the read moves on.' },
    { title: 'Bits can’t be removed', body: 'Clearing a bit could erase another key’s evidence, so a filter is never edited; it is rebuilt when a merge rewrites the table.' },
  ],
  whyNext: 'Every piece is now in place. The final stage puts them together and walks every operation through the complete system.',
  notes: [
    {
      title: 'How often is a “maybe” wrong?',
      body: `With n keys, m bits and k hashes the false-positive rate is about (1 − e^(−kn/m))^k. For ${table.label}, n = ${n}, m = ${m} and k = ${k}, which gives about ${percent(falsePositiveRate(n, m, k))}. Production systems often use 10 bits per key with k = 7, for roughly 1%.`,
    },
    {
      title: 'Fixed size, rising rate',
      body: `The filter’s size is fixed when it is built: adding keys never grows it, unlike a hash set. But every added key sets more bits to 1, so the rate rises. The same ${m} bits holding ${doubled} keys instead of ${n} would be wrong about ${percent(falsePositiveRate(doubled, m, k))} of the time. That is why each table sizes its own filter from its key count: m = max(64, keys × bits per key), k = round(bits per key × ln 2).`,
    },
    {
      title: 'Double hashing',
      body: 'The engines compute two 32-bit FNV-1a hashes of the key with different seeds, h1 and h2, and take position i as (h1 + i·h2) mod m. Two hashes are enough to produce all k positions, and the positions shown here are bit for bit the ones in the engines’ files.',
    },
  ],
  asides: [
    {
      title: 'Why not a hash set of keys?',
      body: 'A hash set per table would answer exactly, but it stores every key and grows with the table. A Bloom filter spends a few bits per key, independent of how long the keys are, and still rules out the large majority of absent keys.',
    },
  ],
  requirements: {
    reads: { level: 'met', reason: 'Most tables without the key are skipped from RAM; a read costs at most one block per “maybe”.' },
    writes: { level: 'met', reason: 'Writes are unchanged; the filter is built once, during a flush or merge.' },
    durability: { level: 'met', reason: 'The filter is part of the table file and is rebuilt into RAM when the table is opened.' },
    unstructured: { level: 'met', reason: 'The filter hashes key bytes; values are untouched.' },
    scale: { level: 'met', reason: 'RAM per table is a few bits per key plus one index entry per block.' },
  },
  walkthroughs: [
    { id: 'build', title: 'Build a filter', operation: 'flush', summary: `Add each key of ${table.label}, setting k = ${k} bits each.`, build: buildFilter },
    { id: 'absent', title: 'Check nokia', operation: 'lookup', summary: 'One 0 bit proves absence; the table is skipped with no disk read.', build: checkAbsentKey },
    { id: 'false-positive', title: 'A false positive', operation: 'lookup', summary: 'probe-069 finds all its bits set, costs one block read, and moves on.', build: falsePositive },
    { id: 'read', title: 'Read with filters', operation: 'read', summary: 'Newest to oldest: skip on a “no”, read one block on a “maybe”.', build: readWithFilters },
  ],
  snippets: S15_SNIPPETS,
};
