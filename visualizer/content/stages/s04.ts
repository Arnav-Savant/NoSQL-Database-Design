import { appendUpdate, scanForLatest } from '@/engine/architectures/s04AppendOnly';
import { S04_SNIPPETS } from '../snippets/s04';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S04: StageContent = {
  ...STAGE_INDEX[4]!,
  summary:
    'The turning point of the whole design: never modify existing bytes. Every insert and every update becomes a new record at the end of the file, and the last occurrence of a key is its current value.',
  problemDetail: [
    'In-place updates either corrupt the neighbouring record or fragment a value across the disk. Both problems come from rewriting a value where it already sits.',
  ],
  change: [
    'The file becomes append-only. An insert appends a record; an update also appends a record, a newer version of the same key. Old records are never touched.',
    'When a key appears several times, the last occurrence is the current value and the earlier ones are stale: still on disk, but no longer the answer.',
    'From here on, records are readable text lines, key:value followed by a newline byte, so byte counts are easy to follow. iphone11:4.8 is 13 bytes; macbook:"Apple" is 16 (string values are quoted).',
  ],
  components: [{ name: 'Append-only file', location: 'disk', purpose: 'Every insert and update is a new record at the end; nothing is ever overwritten.' }],
  limitations: [
    { title: 'Reads are full scans', body: 'Finding a key means reading the whole file, O(n), and the scan can’t stop at the first match.' },
    { title: 'The file grows forever', body: 'Stale versions are never removed, so a key updated a thousand times costs a thousand records.' },
    { title: 'One machine', body: 'There is a single file, with no way to split it across machines.' },
  ],
  whyNext:
    'Writes are now as fast as the disk allows and the corruption is gone. The remaining big problem is that every read scans the entire file. The next stage adds a structure that remembers where each key’s latest record is.',
  notes: [
    {
      title: 'Scanning backwards',
      body: 'Scanning from the end of the file towards the start and stopping at the first match gives the same answer, and usually finishes sooner, because recently written keys are near the end.',
    },
    {
      title: 'Crashes damage at most the tail',
      body: 'Because existing bytes are never rewritten, a crash in the middle of a write can only leave the last, half-written record damaged. Everything before it is intact.',
    },
  ],
  asides: [
    {
      title: 'Lazy removal in Dijkstra’s algorithm',
      body: 'The same “add the new version, ignore the old one later” trick appears in Dijkstra’s shortest-path algorithm. std::priority_queue in C++ can’t change an element’s priority, so implementations push a new entry and skip stale ones when they are popped. Doing the work only when it is needed, instead of immediately, is called a lazy operation.',
      code: {
        language: 'cpp',
        source: [
          'pq.push({newDistance, node});            // never update in place',
          'while (!pq.empty()) {',
          '    auto [distance, node] = pq.top(); pq.pop();',
          '    if (distance > best[node]) continue;  // stale entry: skip it',
          '    relaxNeighbours(node, distance);',
          '}',
        ].join('\n'),
      },
    },
  ],
  requirements: {
    reads: { level: 'unmet', reason: 'Every read scans the whole file and can’t stop at the first match.' },
    writes: { level: 'met', reason: 'Every write is a pure sequential append.' },
    durability: { level: 'met', reason: 'Records are on disk, and a crash can only damage the last one.' },
    unstructured: { level: 'met', reason: 'Each version is a new record, so values can change type and size freely.' },
    scale: { level: 'unmet', reason: 'One ever-growing file on one machine.' },
  },
  walkthroughs: [
    { id: 'update', title: 'Update macbook to "Apple"', operation: 'update', summary: 'Append a new version at offset 47; the old one becomes stale.', build: appendUpdate },
    { id: 'read', title: 'Read macbook', operation: 'read', summary: 'Scan every record and keep the last match.', build: scanForLatest },
  ],
  snippets: S04_SNIPPETS,
};
