import type { Snippet } from '../types';

export const S06_SNIPPETS: Snippet[] = [
  {
    id: 'compact',
    title: 'compactLiveFile()',
    lines: [
      'function compactLiveFile(): void {',
      '  writeLock.acquire();          // puts wait from here',
      '  let writeAt = 0;',
      '  for (const record of wal.scanFromStart()) {',
      '    const latest = offsetMap.get(record.key);',
      '    if (latest !== record.offset) continue; // stale',
      '    wal.moveBytes(record.offset, writeAt); // shift left',
      '    offsetMap.set(record.key, writeAt);    // fix the map',
      '    writeAt += record.bytes;',
      '  }',
      '  wal.truncate(writeAt);        // the file is shorter',
      '  writeLock.release();          // waiting puts resume',
      '}',
    ],
  },
  {
    id: 'put',
    title: 'put(key, value)',
    lines: [
      'function put(key: string, value: Value): void {',
      '  writeLock.wait();             // blocked by compaction',
      '  const offset = wal.append(key, value);',
      '  offsetMap.set(key, offset);',
      '}',
    ],
  },
  {
    id: 'get',
    title: 'get(key)',
    lines: [
      'function get(key: string): Value | undefined {',
      '  const offset = offsetMap.get(key);   // RAM',
      '  if (offset === undefined) return undefined;',
      '  return wal.readAt(offset);  // bytes may have moved',
      '}',
    ],
  },
  {
    id: 'chunks',
    title: 'compactInChunks()',
    lines: [
      'function compactInChunks(chunkBytes: number): void {',
      '  // the file is too big to rewrite in one pass',
      '  for (const chunk of wal.chunks(chunkBytes)) {',
      '    writeLock.acquire();    // still the file puts use',
      '    rewriteChunk(chunk);    // shift records, fix map',
      '    writeLock.release();    // let waiting puts in',
      '  }',
      '}',
    ],
  },
];
