import type { Snippet } from '../types';

export const S04_SNIPPETS: Snippet[] = [
  {
    id: 'put',
    title: 'put(key, value)',
    lines: [
      'function put(key: string, value: Value): void {',
      '  // Inserts and updates are the same operation',
      '  file.append(`${key}:${encode(value)}\\n`);',
      '}  // older versions stay where they are, now stale',
    ],
  },
  {
    id: 'get',
    title: 'get(key)',
    lines: [
      'function get(key: string): Value | undefined {',
      '  let latest: Value | undefined;',
      '  for (const record of file.scanFromStart()) {',
      '    if (record.key === key) latest = record.value;',
      '  }  // can’t stop early: a newer version may follow',
      '  return latest;  // the last occurrence wins',
      '}',
    ],
  },
];
