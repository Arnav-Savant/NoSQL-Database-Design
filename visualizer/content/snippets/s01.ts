import type { Snippet } from '../types';

export const S01_SNIPPETS: Snippet[] = [
  {
    id: 'find',
    title: 'findById(id)',
    lines: [
      'function findById(id: number): Row | undefined {',
      '  // 8 + 60 + 8 + 8: every row is 84 bytes',
      '  for (let at = 0; at < file.size; at += ROW_BYTES) {',
      '    const rowId = file.readInt(at, 8); // id only',
      '    if (rowId === id) return file.readRow(at);',
      '  } // no match: skip the rest of the row unread',
      '  return undefined;',
      '}',
    ],
  },
  {
    id: 'update',
    title: 'updatePrice(id, price)',
    lines: [
      'function updatePrice(id: number, price: number) {',
      '  const row = findRowOffset(id);  // 84 for id 2',
      '  const column = 8 + 60;          // after id, name',
      '  file.overwrite(row + column, price, 8); // same slot',
      '}',
    ],
  },
  {
    id: 'insert',
    title: 'insert(row)',
    lines: [
      'function insert(row: Row): void {',
      '  // Rows are ordered by id, so a new id goes last',
      '  const at = file.size;           // rows × 84',
      '  file.write(at, encodeRow(row)); // 84 bytes',
      '}',
    ],
  },
];
