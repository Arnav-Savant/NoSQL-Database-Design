import type { Snippet } from '../types';

export const S15_SNIPPETS: Snippet[] = [
  {
    id: 'add',
    title: 'bloom.add(key)',
    lines: [
      'function add(bits: Bit[], key: string): void {',
      '  const h1 = fnv1a(key, SEED);',
      '  const h2 = fnv1a(key, SEED ^ MIX) | 1; // odd step',
      '  for (let i = 0; i < k; i++) {',
      '    bits[(h1 + i * h2) % m] = 1;   // k bits per key',
      '  }',
      '}   // the array never grows: m is fixed at build',
    ],
  },
  {
    id: 'check',
    title: 'bloom.mightContain(key)',
    lines: [
      'function mightContain(key: string): boolean {',
      '  for (const position of positions(key)) {',
      '    // One 0 proves the key was never added',
      '    if (bits[position] === 0) return false;',
      '  }',
      '  return true;   // "maybe": other keys may set them',
      '}',
    ],
  },
  {
    id: 'get',
    title: 'get(key)',
    lines: [
      'function get(key: string): Value | undefined {',
      '  const hit = memtable.get(key);   // dirty or clean',
      '  if (hit) return valueOf(hit);     // no disk access',
      '  for (const table of tablesNewestFirst()) {',
      '    // RAM only: skip tables that cannot hold the key',
      '    if (!table.bloom.mightContain(key)) continue;',
      '    const block = table.sparseIndex.blockFor(key);',
      '    const entries = table.readBlock(block); // 1 read',
      '    const entry = binarySearch(entries, key);',
      '    if (entry === undefined) continue; // false positive',
      '    memtable.putClean(key, entry);   // cache it',
      '    return valueOf(entry);  // undefined if a tombstone',
      '  }',
      '  return undefined;',
      '}',
    ],
  },
];
