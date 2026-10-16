import type { Snippet } from '../types';

export const S14_SNIPPETS: Snippet[] = [
  {
    id: 'delete',
    title: 'delete(key)',
    lines: [
      'function remove(key: string): void {',
      "  // Tables are immutable: hide the key, don't erase it",
      '  wal.append(key, TOMBSTONE);         // durable first',
      '  memtable.putDirty(key, TOMBSTONE);  // newest entry',
      '  if (flushIsDue()) flush();          // same as a put',
      '}',
    ],
  },
  {
    id: 'get',
    title: 'get(key)',
    lines: [
      'function get(key: string): Value | undefined {',
      '  const hit = memtable.get(key);',
      '  if (hit) return hit.isTombstone ? undefined : hit.value;',
      '  for (const table of tablesNewestFirst()) {',
      '    const entry = table.find(key);    // one block read',
      '    if (entry === undefined) continue;',
      '    // The newest entry wins, even if it says "deleted"',
      '    return entry.isTombstone ? undefined : entry.value;',
      '  }',
      '  return undefined;',
      '}',
    ],
  },
  {
    id: 'merge',
    title: 'merge(older, newer)',
    lines: [
      'function merge(older: Table, newer: Table): Entry[] {',
      '  // Safe only if no live table is older than `older`',
      '  const dropTombstones = live.every(',
      '    (table) => table.minSeq >= older.minSeq);',
      '  const out: Entry[] = [];',
      '  for (const e of twoPointerMerge(older, newer)) {',
      '    // On equal keys the newer entry was chosen',
      '    if (dropTombstones && e.isTombstone) continue;',
      '    out.push(e);',
      '  }',
      '  return out;                 // written as one new table',
      '}',
    ],
  },
];
