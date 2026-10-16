import type { Snippet } from '../types';

export const S09_SNIPPETS: Snippet[] = [
  {
    id: 'put',
    title: 'put(key, value)',
    lines: [
      'function put(key: string, value: Value): void {',
      '  if (!active.fits(key, value)) rollOver();',
      '  active.append(key, value);      // disk: durability',
      '  memtable.set(key, value);       // RAM: fast reads',
      '  // no map write: the memtable answers for this key',
      '}',
    ],
  },
  {
    id: 'get',
    title: 'get(key)',
    lines: [
      'function get(key: string): Value | undefined {',
      '  const fresh = memtable.get(key);  // always first',
      '  if (fresh !== undefined) return fresh; // newest',
      '  const location = offsetMap.get(key); // closed only',
      '  if (location === undefined) return undefined;',
      '  return segments.readAt(location);    // one seek',
      '}',
    ],
  },
  {
    id: 'roll',
    title: 'rollOver()',
    lines: [
      'function rollOver(): void {',
      '  const closed = active;',
      '  closed.close();                     // read-only now',
      '  active = createSegment(closed.number + 1);',
      '  // one bulk update instead of a write on every put',
      '  offsetMap.setAll(closed.scan().map(locationOf));',
      '  memtable.clear();  // mirrors the empty new segment',
      '}',
    ],
  },
];
