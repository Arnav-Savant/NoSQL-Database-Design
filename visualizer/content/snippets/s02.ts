import type { Snippet } from '../types';

export const S02_SNIPPETS: Snippet[] = [
  {
    id: 'get',
    title: 'get(key)',
    lines: [
      'function get(key: string): number | undefined {',
      '  let at = 0;',
      '  while (at < file.size) {',
      '    const end = file.indexOf(":", at); // byte by byte',
      '    const found = file.readText(at, end);',
      '    if (found === key) return file.readFloat(end + 1);',
      '    at = end + 1 + 4;  // skip the 4-byte value',
      '  }',
      '  return undefined;',
      '}',
    ],
  },
  {
    id: 'insert',
    title: 'insert(key, rating)',
    lines: [
      'function insert(key: string, rating: number): void {',
      '  const at = file.size;            // end of the file',
      '  file.write(at, key + ":");',
      '  file.writeFloat(at + key.length + 1, rating);',
      '}',
    ],
  },
  {
    id: 'update',
    title: 'update(key, value)',
    lines: [
      'function update(key: string, value: string): void {',
      '  const slot = findValueSlot(key); // scan, as in get',
      '  // The slot is 4 bytes, and nothing checks the size',
      '  file.write(slot, value);         // "Apple" is 5 bytes',
      '}',
    ],
  },
];
