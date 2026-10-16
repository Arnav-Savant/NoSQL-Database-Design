import { findById, insertRow, updatePrice } from '@/engine/architectures/s01RelationalRows';
import { S01_SNIPPETS } from '../snippets/s01';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S01: StageContent = {
  ...STAGE_INDEX[1]!,
  summary:
    'A relational table has a fixed schema: every column has a declared type with a known size. Known sizes mean every row has the same size, and the same size means addresses can be calculated instead of searched for.',
  problemDetail: [
    'Before designing anything new, we need a baseline. Relational databases such as MySQL and PostgreSQL are the most familiar storage engines, and seeing why their layout is fast shows exactly what we lose once values stop having a fixed type.',
  ],
  change: [
    'The products table has four columns: id (8 bytes), name (at most 60 characters, so 60 bytes), price (8 bytes) and rating (8 bytes). Every row is exactly 84 bytes, whatever it contains.',
    'Rows are stored back to back on disk, ordered by id, so row n starts at offset n × 84. An offset is a position in a file, counted in bytes from the start. Inside a row, each column also sits at a fixed offset: price is always 68 bytes in.',
  ],
  components: [
    { name: 'Table file', location: 'disk', purpose: 'Rows stored back to back, ordered by id, each exactly 84 bytes.' },
    { name: 'Schema', location: 'logic', purpose: 'Fixes each column’s type and size, which fixes every row size and every column offset.' },
  ],
  limitations: [
    { title: 'The schema must be known in advance', body: 'Every value has to fit a declared type and maximum size. There is no room for a value whose type changes from a number to a string.' },
    { title: 'Wasted space', body: 'A short name such as "iPad" still occupies its full 60-byte slot.' },
    { title: 'Schema changes are expensive', body: 'Changing a column’s size changes every row’s size, so every row in the file has to be rewritten.' },
    { title: 'Linear scans', body: 'Without extra structures, finding a row still visits rows one by one: O(n), even if each visit only reads 8 bytes.' },
  ],
  whyNext:
    'All of this depends on knowing sizes in advance. We want the opposite: unstructured values whose type can change, much like a hash map or a JSON object. The next stage stores key-value pairs with the same “bytes side by side” idea and watches it break.',
  notes: [
    {
      title: 'SQL is a standard, not a database',
      body: 'SQL is a standardised query language. Each database implements its own dialect of the standard, which is why some syntax works in MySQL but not in PostgreSQL, and the other way round.',
    },
  ],
  asides: [
    {
      title: 'Making reads faster',
      body: 'Scanning rows one by one is O(n). Relational databases speed reads up in three common ways: an index, a separate structure such as a B+ tree that finds a row in O(log n); a cache that keeps frequently read rows in memory; and partitioning, which splits a table into several pieces so a lookup only searches the one piece that can contain the key.',
    },
  ],
  requirements: {
    reads: { level: 'partial', reason: 'Rows are found by fixed-size jumps, but still one row at a time without an index.' },
    writes: { level: 'partial', reason: 'In-place updates are cheap, but only for values that fit the declared schema.' },
    durability: { level: 'met', reason: 'Every row lives in a file on disk.' },
    unstructured: { level: 'unmet', reason: 'Every value must fit a fixed type and size.' },
    scale: { level: 'unmet', reason: 'One table file on one machine.' },
  },
  walkthroughs: [
    { id: 'find', title: 'Find id 3', operation: 'read', summary: 'Read each id and jump 84 bytes until the match at offset 168.', build: findById },
    { id: 'update', title: 'Update the price of id 2', operation: 'update', summary: 'Overwrite 8 bytes at offset 152; nothing else moves.', build: updatePrice },
    { id: 'insert', title: 'Insert id 5', operation: 'insert', summary: 'Append one 84-byte row at offset 336.', build: insertRow },
  ],
  snippets: S01_SNIPPETS,
};
