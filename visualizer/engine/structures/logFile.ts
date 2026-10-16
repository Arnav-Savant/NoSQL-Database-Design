import type { DiskComponent, PositionedRecord, Value } from '../model';

type LogStatus = 'active' | 'closed' | 'deleted';
type SizeOf = (key: string, item: Value) => number;

interface LogFileOptions {
  id: string;
  label: string;
  sizeOf: SizeOf;
  status?: LogStatus;
  capacityBytes?: number;
}

/** An append-only log: records are only ever added at the end; older versions become stale. */
export class LogFileModel {
  readonly id: string;
  readonly label: string;
  status: LogStatus;
  readonly capacityBytes: number | undefined;
  tornBytes = 0;
  readonly #sizeOf: SizeOf;
  readonly #records: PositionedRecord[] = [];
  #usedBytes = 0;
  #nextVersion = 0;

  constructor({ id, label, sizeOf, status = 'active', capacityBytes }: LogFileOptions) {
    this.id = id;
    this.label = label;
    this.#sizeOf = sizeOf;
    this.status = status;
    this.capacityBytes = capacityBytes;
  }

  get usedBytes(): number {
    return this.#usedBytes;
  }

  get records(): readonly PositionedRecord[] {
    return this.#records;
  }

  sizeOf(key: string, item: Value): number {
    return this.#sizeOf(key, item);
  }

  wouldOverflow(key: string, item: Value): boolean {
    return this.capacityBytes !== undefined && this.#usedBytes + this.#sizeOf(key, item) > this.capacityBytes;
  }

  append(key: string, item: Value): PositionedRecord {
    const bytes = this.#sizeOf(key, item);
    const record: PositionedRecord = {
      recordId: `${this.id}:${key}:${this.#nextVersion++}`,
      key,
      value: item,
      offset: this.#usedBytes,
      bytes,
    };
    this.#records.push(record);
    this.#usedBytes += bytes;
    return record;
  }

  /** Marks every earlier version of `key` as stale, keeping the newest. */
  markOlderVersionsStale(key: string): void {
    const versions = this.#records.filter((record) => record.key === key);
    for (const record of versions.slice(0, -1)) record.stale = true;
  }

  latest(key: string): PositionedRecord | undefined {
    for (let i = this.#records.length - 1; i >= 0; i--) {
      const record = this.#records[i];
      if (record && record.key === key) return record;
    }
    return undefined;
  }

  /** Removes stale records and shifts every later record left, as an in-place compaction would. */
  compactInPlace(): { removed: PositionedRecord[]; moved: { key: string; from: number; to: number }[] } {
    const removed = this.#records.filter((record) => record.stale);
    const moved: { key: string; from: number; to: number }[] = [];
    const kept = this.#records.filter((record) => !record.stale);
    let offset = 0;
    for (const record of kept) {
      if (record.offset !== offset) moved.push({ key: record.key, from: record.offset, to: offset });
      record.offset = offset;
      offset += record.bytes;
    }
    this.#records.splice(0, this.#records.length, ...kept);
    this.#usedBytes = offset;
    return { removed, moved };
  }

  view(): DiskComponent {
    return {
      kind: 'log-file',
      id: this.id,
      label: this.label,
      status: this.status,
      capacityBytes: this.capacityBytes,
      usedBytes: this.#usedBytes,
      records: this.#records.map((record) => ({ ...record })),
      tornBytes: this.tornBytes > 0 ? this.tornBytes : undefined,
    };
  }
}
