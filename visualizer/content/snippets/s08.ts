import type { Snippet } from '../types';

export const S08_SNIPPETS: Snippet[] = [
  {
    id: 'put',
    title: 'put(key, value)',
    lines: [
      'function put(key: string, value: Value): void {',
      '  if (!active.fits(key, value)) rollOver(); // stage 7',
      '  const offset = active.append(key, value); // disk',
      '  memtable.set(key, value);                 // RAM',
      '  offsetMap.set(key, { segment: active.number, offset });',
      '}',
    ],
  },
  {
    id: 'get',
    title: 'get(key)',
    lines: [
      'function get(key: string): Value | undefined {',
      '  const fresh = memtable.get(key);  // newest data, RAM',
      '  if (fresh !== undefined) return fresh; // hit: no disk',
      '  const location = offsetMap.get(key);   // RAM',
      '  if (location === undefined) return undefined;',
      '  return segments.readAt(location);  // miss: one seek',
      '}',
    ],
  },
  {
    id: 'restart',
    title: 'restart()',
    lines: [
      'function restart(): void {',
      '  // RAM was wiped: both structures start empty',
      '  for (const record of active.scan()) {',
      '    memtable.set(record.key, record.value); // newest wins',
      '  }',
      '  for (const segment of segments.oldestFirst()) {',
      '    for (const record of segment.scan()) {',
      '      offsetMap.set(record.key, locationOf(record));',
      '    }',
      '  }',
      '}',
    ],
  },
];
