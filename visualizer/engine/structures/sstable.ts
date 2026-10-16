import type { Block, DiskComponent, RecordView, Value } from '../model';
import { BloomModel } from './bloom';
import { compareKeys } from './keyOrder';

type SSTableComponent = Extract<DiskComponent, { kind: 'sstable' }>;

interface BuildOptions {
  minSeq: number;
  maxSeq: number;
  records: readonly RecordView[];
  blockSizeBytes: number;
  sizeOf: (key: string, item: Value) => number;
  showBlocks?: boolean;
  showSparseIndex?: boolean;
  bloomBitsPerKey?: number;
}

const pad = (sequence: number) => String(sequence).padStart(6, '0');

export function tableName(minSeq: number, maxSeq: number): string {
  return `sst-${pad(minSeq)}-${pad(maxSeq)}.sst`;
}

export function tableId(minSeq: number, maxSeq: number): string {
  return `sst-${minSeq}-${maxSeq}`;
}

/** Packs sorted records into blocks exactly as the engines' SSTable writer does. */
export function buildSSTable(options: BuildOptions): SSTableComponent & { bloomModel?: BloomModel } {
  const { minSeq, maxSeq, blockSizeBytes, sizeOf } = options;
  const id = tableId(minSeq, maxSeq);
  const records = [...options.records].sort((left, right) => compareKeys(left.key, right.key));

  const blocks: Block[] = [];
  let current: Block | null = null;
  let offset = 0;
  for (const record of records) {
    const bytes = sizeOf(record.key, record.value);
    if (current === null || current.length + bytes > blockSizeBytes) {
      if (current !== null) blocks.push(current);
      current = { firstKey: record.key, offset, length: 0, records: [] };
    }
    current.records.push({ ...record, recordId: `${id}:${record.key}`, state: undefined, stale: undefined, offset, bytes });
    current.length += bytes;
    offset += bytes;
  }
  if (current !== null) blocks.push(current);

  let bloomModel: BloomModel | undefined;
  if (options.bloomBitsPerKey !== undefined) {
    bloomModel = BloomModel.forEntryCount(records.length, options.bloomBitsPerKey);
    for (const record of records) bloomModel.add(record.key);
  }

  return {
    kind: 'sstable',
    id,
    label: tableName(minSeq, maxSeq),
    minSeq,
    maxSeq,
    status: 'live',
    blocks,
    showBlocks: options.showBlocks ?? false,
    showSparseIndex: options.showSparseIndex ?? false,
    bloom: bloomModel?.view(),
    bloomModel,
  };
}

export function tableRecords(table: SSTableComponent): RecordView[] {
  return table.blocks.flatMap((block) => block.records);
}

/** The block a key can live in: the last block whose first key is <= key, or -1. */
export function locateBlock(table: SSTableComponent, key: string): number {
  let found = -1;
  table.blocks.forEach((block, index) => {
    if (compareKeys(block.firstKey, key) <= 0) found = index;
  });
  return found;
}

/** Each probe of a binary search over `records`, ending with the match index or -1. */
export function binarySearchProbes(records: readonly RecordView[], key: string): { probes: { low: number; high: number; mid: number }[]; found: number } {
  const probes: { low: number; high: number; mid: number }[] = [];
  let low = 0;
  let high = records.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    probes.push({ low, high, mid });
    const order = compareKeys(records[mid]?.key ?? '', key);
    if (order === 0) return { probes, found: mid };
    if (order < 0) low = mid + 1;
    else high = mid - 1;
  }
  return { probes, found: -1 };
}

/** Strips the build-time Bloom model so the component can be cloned into a snapshot. */
export function asComponent(table: SSTableComponent & { bloomModel?: BloomModel }): SSTableComponent {
  const { bloomModel: _bloomModel, ...component } = table;
  return component;
}
