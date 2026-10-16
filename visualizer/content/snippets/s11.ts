import type { Snippet } from '../types';

export const S11_SNIPPETS: Snippet[] = [
  {
    id: 'trigger',
    title: 'afterFlush()',
    lines: [
      'function afterFlush(tables: SSTable[]): void {',
      '  while (tables.length >= COMPACTION_TRIGGER) {  // 3 here',
      '    const [older, newer] = oldestTwo(tables);',
      '    replace(tables, [older, newer], compact(older, newer));',
      '  }',
      '}',
    ],
  },
  {
    id: 'compact',
    title: 'compact(older, newer)',
    lines: [
      'function compact(older: SSTable, newer: SSTable): SSTable {',
      '  const out = new TableWriter(older.minSeq, newer.maxSeq);',
      '  let i = 0, j = 0;   // one pointer per sorted input',
      '  while (i < older.length || j < newer.length) {',
      '    const a = older.at(i), b = newer.at(j);',
      '    if (!b || (a && a.key < b.key)) { out.add(a); i++; }',
      '    else if (!a || b.key < a.key) { out.add(b); j++; }',
      '    else { out.add(b); i++; j++; }  // equal: newer wins',
      '  }',
      '  const table = out.finish();    // tmp, sync, rename',
      '  deleteFiles(older, newer);     // only once output is safe',
      '  return table;',
      '}',
    ],
  },
  {
    id: 'tree',
    title: 'compactAll(tables)',
    lines: [
      'async function compactAll(tables: SSTable[]) {',
      '  // oldest first; each output is named by its range',
      '  while (tables.length > 1) {',
      '    const pairs = chunk(tables, 2);  // independent pairs',
      '    tables = await parallel(pairs.map(mergePair));',
      '  }',
      '  return tables[0];',
      '}',
    ],
  },
];
