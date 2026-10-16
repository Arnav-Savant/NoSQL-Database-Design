import type { Snippet } from '../types';

export const S13_SNIPPETS: Snippet[] = [
  {
    id: 'get',
    title: 'get(key)',
    lines: [
      'function get(key: string): Value | undefined {',
      '  const hit = memtable.get(key);   // newest value, if here',
      '  if (hit) return hit.value;',
      '  for (const table of tablesNewestFirst()) {',
      '    const value = find(table, key);  // at most 1 block read',
      '    if (value !== undefined) {',
      '      memtable.putClean(key, value);',
      '      return value;',
      '    }',
      '  }',
      '  return undefined;',
      '}',
    ],
  },
  {
    id: 'find',
    title: 'find(table, key)',
    lines: [
      'function find(table: SSTable, key: string) {',
      '  const b = table.sparseIndex.lastAtOrBefore(key);  // RAM',
      '  if (b === -1) return undefined;  // before the first key',
      '  const block = table.readBlock(b);  // the one disk read',
      '  return binarySearch(block.entries, key);  // in RAM',
      '}',
    ],
  },
  {
    id: 'search',
    title: 'binarySearch(entries, key)',
    lines: [
      'function binarySearch(entries: Entry[], key: string) {',
      '  let low = 0, high = entries.length - 1;',
      '  while (low <= high) {',
      '    const mid = (low + high) >> 1;   // no disk access',
      '    if (entries[mid].key === key) return entries[mid].value;',
      '    if (entries[mid].key < key) low = mid + 1;',
      '    else high = mid - 1;',
      '  }',
      '  return undefined;',
      '}',
    ],
  },
];
