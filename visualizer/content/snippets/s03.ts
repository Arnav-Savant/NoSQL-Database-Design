import type { Snippet } from '../types';

export const S03_SNIPPETS: Snippet[] = [
  {
    id: 'update',
    title: 'update(key, value)',
    lines: [
      'function update(key: string, value: string): void {',
      '  const slot = findValueSlot(key);  // linear scan',
      '  const fits = SLOT_BYTES - POINTER_BYTES; // 4 - 2',
      '  file.write(slot, value.slice(0, fits));',
      '  const rest = value.slice(fits);',
      '  const far = freeSpace.write(rest); // elsewhere',
      '  file.writePointer(slot + fits, far); // 2 bytes',
      '}   // never writes past the slot',
    ],
  },
  {
    id: 'get',
    title: 'get(key)',
    lines: [
      'function get(key: string): string | undefined {',
      '  const slot = findValueSlot(key);  // linear scan',
      '  if (slot === undefined) return undefined;',
      '  let value = file.readText(slot, 2);',
      '  const far = file.readPointer(slot + 2);',
      '  value += file.readTextAt(far);    // random seek',
      '  return value;                     // "Ap" + "ple"',
      '}',
    ],
  },
];
