export type ValueType = 'number' | 'string' | 'boolean' | 'null' | 'tombstone';

export interface Value {
  type: ValueType;
  display: string;
}

export type EntryState = 'dirty' | 'clean';

export interface RecordView {
  recordId: string;
  key: string;
  value: Value;
  stale?: boolean;
  state?: EntryState;
}

export interface PositionedRecord extends RecordView {
  offset: number;
  bytes: number;
}

export type ByteRole = 'key' | 'separator' | 'value' | 'pointer' | 'free' | 'overwritten' | 'spill';

export interface ByteCell {
  offset: number;
  char: string;
  role: ByteRole;
  recordId?: string;
}

export interface Block {
  firstKey: string;
  offset: number;
  length: number;
  records: PositionedRecord[];
}

export interface BloomView {
  bits: (0 | 1)[];
  hashCount: number;
}

export interface OffsetRow {
  key: string;
  target: string;
}

export type RamComponent =
  | { kind: 'offset-map'; id: string; label: string; rows: OffsetRow[] }
  | { kind: 'memtable'; id: string; label: string; capacity?: number; rows: RecordView[] }
  | {
      kind: 'merge-lanes';
      id: string;
      label: string;
      older: { name: string; records: RecordView[] };
      newer: { name: string; records: RecordView[] };
      output: RecordView[];
      olderPointer: number;
      newerPointer: number;
      decision?: string;
    }
  | {
      kind: 'block-buffer';
      id: string;
      label: string;
      records: RecordView[];
      probe?: { low: number; high: number; mid: number };
    };

export type DiskComponent =
  | {
      kind: 'row-file';
      id: string;
      label: string;
      columns: { name: string; bytes: number }[];
      rows: { id: number; cells: (string | number)[] }[];
    }
  | { kind: 'byte-file'; id: string; label: string; cells: ByteCell[] }
  | {
      kind: 'log-file';
      id: string;
      label: string;
      status: 'active' | 'closed' | 'deleted';
      capacityBytes?: number;
      usedBytes: number;
      records: PositionedRecord[];
      tornBytes?: number;
    }
  | {
      kind: 'sstable';
      id: string;
      label: string;
      minSeq: number;
      maxSeq: number;
      status: 'live' | 'writing' | 'deleted';
      blocks: Block[];
      showBlocks: boolean;
      showSparseIndex: boolean;
      bloom?: BloomView;
    };

export type MachineComponent = RamComponent | DiskComponent;

export interface MachineState {
  ram: RamComponent[];
  disk: DiskComponent[];
  blockedWrites?: boolean;
}
