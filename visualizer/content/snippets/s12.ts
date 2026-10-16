import type { Snippet } from '../types';

export const S12_SNIPPETS: Snippet[] = [
  {
    id: 'get',
    title: 'get(key)',
    lines: [
      'function get(key: string): Value | undefined {',
      '  const hit = memtable.get(key);   // newest value, if here',
      '  if (hit) return hit.value;',
      '  for (const table of tablesNewestFirst()) { // order counts',
      '    const value = binarySearch(table, key);',
      '    if (value !== undefined) {',
      '      memtable.putClean(key, value);  // cache it',
      '      return value;          // first match is the newest',
      '    }',
      '  }',
      '  return undefined;',
      '}',
    ],
  },
  {
    id: 'search',
    title: 'binarySearch(table, key)',
    lines: [
      'function binarySearch(table: SSTable, key: string) {',
      '  let low = 0, high = table.length - 1;',
      '  while (low <= high) {',
      '    const mid = (low + high) >> 1;',
      '    const entry = table.readEntry(mid);  // random disk read',
      '    if (entry.key === key) return entry.value;',
      '    if (entry.key < key) low = mid + 1;   // byte order',
      '    else high = mid - 1;',
      '  }',
      '  return undefined;   // low passed high: not in this table',
      '}',
    ],
  },
];
