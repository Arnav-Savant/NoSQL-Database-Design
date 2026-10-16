import type { ByteCell } from '../model';

const FLOAT_BYTES = 4;

/**
 * Lays out `key:value` as one cell per byte, the way the naive file of stages 2 to 4 stores it.
 * The value is drawn across its fixed 4-byte float slot.
 */
export function encodeByteRecord(key: string, valueText: string, startOffset: number, recordId: string): ByteCell[] {
  const cells: ByteCell[] = [];
  let offset = startOffset;
  for (const char of key) cells.push({ offset: offset++, char, role: 'key', recordId });
  cells.push({ offset: offset++, char: ':', role: 'separator', recordId });
  const valueChars = valueText.padEnd(FLOAT_BYTES, ' ').slice(0, FLOAT_BYTES);
  for (const char of valueChars) cells.push({ offset: offset++, char, role: 'value', recordId });
  return cells;
}

export function byteRecordLength(key: string): number {
  return key.length + 1 + FLOAT_BYTES;
}

/** Offsets of each record start in a sequence of byte records. */
export function recordStarts(keys: readonly string[]): number[] {
  const starts: number[] = [];
  let offset = 0;
  for (const key of keys) {
    starts.push(offset);
    offset += byteRecordLength(key);
  }
  return starts;
}
