import { TableRange } from '../sstable/tableRange.js';

const SEQUENCE_DIGITS = 6;
const WAL_PATTERN = /^wal-(\d{6})\.log$/;
const TABLE_PATTERN = /^sst-(\d{6})-(\d{6})\.sst$/;
export const TEMP_SUFFIX = '.tmp';

const pad = (sequence) => String(sequence).padStart(SEQUENCE_DIGITS, '0');

export function walFileName(sequence) {
  return `wal-${pad(sequence)}.log`;
}

export function tableFileName(range) {
  return `sst-${pad(range.min)}-${pad(range.max)}.sst`;
}

export function parseWalFileName(name) {
  const match = WAL_PATTERN.exec(name);
  return match ? Number(match[1]) : null;
}

export function parseTableFileName(name) {
  const match = TABLE_PATTERN.exec(name);
  return match ? new TableRange(Number(match[1]), Number(match[2])) : null;
}

export function isTempFileName(name) {
  return name.endsWith(TEMP_SUFFIX);
}
