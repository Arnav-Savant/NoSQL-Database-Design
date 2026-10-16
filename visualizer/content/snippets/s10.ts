import type { Snippet } from '../types';

export const S10_SNIPPETS: Snippet[] = [
  {
    id: 'put',
    title: 'put(key, value)',
    lines: [
      'function put(key: string, value: Value): void {',
      '  wal.append(key, value);          // durable first',
      '  memtable.putDirty(key, value);  // may evict a clean one',
      '  if (wal.bytes >= WAL_MAX_BYTES || memtable.allDirty()) {',
      '    flush();   // all dirty also flushes, to free slots',
      '  }',
      '}',
    ],
  },
  {
    id: 'flush',
    title: 'flush()',
    lines: [
      'function flush(): void {',
      '  const dirty = memtable.dirtyEntries();  // 1. collect',
      '  dirty.sort(compareKeyBytes);            // 2. sort',
      '  const table = writeSSTable(dirty); // 3. tmp, sync, rename',
      '  memtable.markAllClean();            // 4. keep as cache',
      '  const next = openWal(wal.sequence + 1);  // 5. new WAL',
      '  deleteFile(wal.name);           // 6. its data is in table',
      '  offsetMap.addAll(table.offsets()); // 7. index the table',
      '  wal = next;',
      '}',
    ],
  },
  {
    id: 'evict',
    title: 'evictOne()',
    lines: [
      'function evictOne(): void {',
      '  for (const key of lru.leastRecentFirst()) {',
      '    if (memtable.isDirty(key)) continue;  // only in the WAL',
      '    memtable.remove(key);       // still safe in an SSTable',
      '    return;',
      '  }',
      '}',
    ],
  },
  {
    id: 'get',
    title: 'get(key)',
    lines: [
      'function get(key: string): Value | undefined {',
      '  const hit = memtable.get(key);   // newest value, if here',
      '  if (hit) return hit.value;       // also refreshes LRU',
      '  const where = offsetMap.get(key);  // (table, offset)',
      '  if (!where) return undefined;',
      '  const value = where.table.readAt(where.offset);',
      '  memtable.putClean(key, value);   // cache it; may evict',
      '  return value;',
      '}',
    ],
  },
];
