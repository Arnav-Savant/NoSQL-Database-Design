import type { Snippet } from '../types';

export const S05_SNIPPETS: Snippet[] = [
  {
    id: 'put',
    title: 'put(key, value)',
    lines: [
      'function put(key: string, value: Value): void {',
      '  const offset = wal.append(key, value);   // sequential disk write',
      '  offsetMap.set(key, offset);              // RAM write',
      '}',
    ],
  },
  {
    id: 'get',
    title: 'get(key)',
    lines: [
      'function get(key: string): Value | undefined {',
      '  const offset = offsetMap.get(key);       // O(1) in RAM',
      '  if (offset === undefined) return undefined;',
      '  return wal.readAt(offset);               // one random disk read',
      '}',
    ],
  },
  {
    id: 'rebuild',
    title: 'rebuildIndex()',
    lines: [
      'function rebuildIndex(): void {',
      '  for (const record of wal.scanFromStart()) {',
      '    offsetMap.set(record.key, record.offset); // later records win',
      '  }',
      '}',
    ],
  },
];
