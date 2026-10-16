import type { Value } from './model';

export type RawValue = number | string | boolean | null;

const encoder = new TextEncoder();

export function utf8Length(text: string): number {
  return encoder.encode(text).length;
}

// Same rule as the engines: integers drop the decimal point, everything else is shortest round-trip.
export function formatNumber(number: number): string {
  return Number.isInteger(number) ? number.toFixed(0) : String(number);
}

export function value(raw: RawValue): Value {
  if (raw === null) return { type: 'null', display: 'null' };
  if (typeof raw === 'boolean') return { type: 'boolean', display: raw ? 'true' : 'false' };
  if (typeof raw === 'number') return { type: 'number', display: formatNumber(raw) };
  return { type: 'string', display: `"${raw}"` };
}

export const TOMBSTONE: Value = Object.freeze({ type: 'tombstone', display: 'deleted' });

function valueBytes(item: Value): number {
  switch (item.type) {
    case 'null':
    case 'tombstone':
      return 0;
    case 'boolean':
      return 1;
    case 'number':
      return 8;
    case 'string':
      return utf8Length(item.display.slice(1, -1));
  }
}

/** Size of an encoded entry in the engines: u16 key length, key, u8 type, u32 value length, value. */
export function entryBytes(key: string, item: Value): number {
  return 2 + utf8Length(key) + 1 + 4 + valueBytes(item);
}

/** Size of a WAL record in the engines: u32 checksum, u32 length, then the entry. */
export function walRecordBytes(key: string, item: Value): number {
  return 8 + entryBytes(key, item);
}

/** Size of the readable `key:value\n` records used in the early stages. */
export function textLineBytes(key: string, item: Value): number {
  return utf8Length(`${key}:${item.display}\n`);
}
