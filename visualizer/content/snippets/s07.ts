import type { Snippet } from '../types';

export const S07_SNIPPETS: Snippet[] = [
  {
    id: 'put',
    title: 'put(key, value)',
    lines: [
      'function put(key: string, value: Value): void {',
      '  const size = recordSize(key, value);',
      '  if (active.used + size > SEGMENT_LIMIT) {',
      '    active.close();             // read-only from now on',
      '    active = createSegment(active.number + 1);',
      '  }',
      '  const offset = active.append(key, value);',
      '  offsetMap.set(key, { segment: active.number, offset });',
      '}',
    ],
  },
  {
    id: 'get',
    title: 'get(key)',
    lines: [
      'function get(key: string): Value | undefined {',
      '  const location = offsetMap.get(key);   // RAM',
      '  if (location === undefined) return undefined;',
      '  const file = segments.get(location.segment);',
      '  return file.readAt(location.offset);   // one seek',
      '}',
    ],
  },
  {
    id: 'compact',
    title: 'compactSegment(old)',
    lines: [
      'function compactSegment(old: Segment): void {',
      '  // closed segments only: nothing appends to them',
      '  const copy = createFile(`${old.name}.tmp`);',
      '  const moved: [string, number][] = [];',
      '  for (const record of old.scan()) {',
      '    const latest = offsetMap.get(record.key);',
      '    const live = latest?.segment === old.number',
      '      && latest.offset === record.offset;',
      '    if (!live) continue;              // stale: drop it',
      '    const offset = copy.append(record.key, record.value);',
      '    moved.push([record.key, offset]);',
      '  }',
      '  replaceFile(old, copy);   // rename over, delete old',
      '  for (const [key, offset] of moved)',
      '    offsetMap.set(key, { segment: old.number, offset });',
      '}',
    ],
  },
];
