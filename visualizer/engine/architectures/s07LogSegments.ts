import { BASE_WRITES, UPDATES } from '@/content/dataset';
import type { DiskComponent, MachineState, OffsetRow, PositionedRecord, RamComponent, Value } from '../model';
import { LogFileModel } from '../structures/logFile';
import { TraceRecorder, type Step } from '../trace';
import { textLineBytes, value, type RawValue } from '../values';

/** Kept tiny so roll-overs happen within a handful of records. Real systems use tens of megabytes. */
export const SEGMENT_LIMIT = 40;
export const MAP = 'offset-map';

export interface Location {
  segment: number;
  offset: number;
}

export const segmentId = (segment: number) => `wal-${segment}`;
export const segmentLabel = (segment: number) => `wal-${String(segment).padStart(6, '0')}.log`;
export const locationText = (location: Location) => `wal-${location.segment} @ ${location.offset}`;

function newSegment(segment: number, label = segmentLabel(segment), id = segmentId(segment)): LogFileModel {
  return new LogFileModel({ id, label, sizeOf: textLineBytes, capacityBytes: SEGMENT_LIMIT });
}

/** A WAL split into numbered segments with a size limit; only the newest one accepts appends. */
export class SegmentedLog {
  readonly files: LogFileModel[] = [newSegment(1)];

  get active(): LogFileModel {
    return this.files[this.files.length - 1]!;
  }

  get activeNumber(): number {
    return this.numberOf(this.active);
  }

  numberOf(file: LogFileModel): number {
    return Number(file.id.split('-')[1]);
  }

  file(segment: number): LogFileModel {
    return this.files.find((file) => this.numberOf(file) === segment)!;
  }

  fits(key: string, item: Value): boolean {
    return !this.active.wouldOverflow(key, item);
  }

  /** Closes the active segment and opens the next one. */
  roll(): { closed: LogFileModel; opened: LogFileModel } {
    const closed = this.active;
    closed.status = 'closed';
    const opened = newSegment(this.activeNumber + 1);
    this.files.push(opened);
    return { closed, opened };
  }

  /** Appends to the active segment (the caller rolls first) and marks older versions in any segment stale. */
  append(key: string, item: Value): { record: PositionedRecord; location: Location } {
    const record = this.active.append(key, item);
    for (const file of this.files) {
      for (const older of file.records) if (older.key === key && older !== record) older.stale = true;
    }
    return { record, location: { segment: this.activeNumber, offset: record.offset } };
  }

  /** Swaps in a rewritten copy of a closed segment under the original name. */
  replace(segment: number, records: readonly PositionedRecord[]): LogFileModel {
    const copy = newSegment(segment);
    for (const record of records) copy.append(record.key, record.value);
    copy.status = 'closed';
    this.files.splice(this.files.indexOf(this.file(segment)), 1, copy);
    return copy;
  }

  views(): DiskComponent[] {
    return this.files.map((file) => file.view());
  }
}

export function mapView(map: ReadonlyMap<string, Location>, label = 'Offset map'): RamComponent {
  return { kind: 'offset-map', id: MAP, label, rows: [...map].map(([key, location]): OffsetRow => ({ key, target: locationText(location) })) };
}

/** Every base write, then macbook = "Apple": four segments, the last one active. */
export const STAGE7_WRITES: readonly (readonly [string, RawValue])[] = [...BASE_WRITES, UPDATES[0]!];

export function seedSegments(writes: readonly (readonly [string, RawValue])[] = STAGE7_WRITES) {
  const log = new SegmentedLog();
  const offsets = new Map<string, Location>();
  for (const [key, raw] of writes) {
    if (!log.fits(key, value(raw))) log.roll();
    offsets.set(key, log.append(key, value(raw)).location);
  }
  return { log, offsets };
}

const describe = (key: string, raw: RawValue) => `${key}:${value(raw).display}`;

export function writesFillSegments(): readonly Step[] {
  const log = new SegmentedLog();
  const offsets = new Map<string, Location>();
  const recorder = new TraceRecorder((): MachineState => ({ ram: [mapView(offsets)], disk: log.views() }));
  const pending = [...STAGE7_WRITES];

  recorder.record({
    title: 'One empty active segment',
    narration: `The log is now a series of numbered files called segments, each limited to ${SEGMENT_LIMIT} bytes here. ${segmentLabel(1)} is the active segment: the only one that accepts writes.`,
    focus: { componentId: segmentId(1) },
    touched: [segmentId(1), MAP],
    snippet: { id: 'put', line: 1 },
  });

  /** Appends writes until the next one would overflow, as one step. */
  const fillActive = (title: string, extra: () => string = () => '') => {
    const appended: PositionedRecord[] = [];
    const io: Step['io'] = [];
    while (pending.length > 0) {
      const [key, raw] = pending[0]!;
      if (!log.fits(key, value(raw))) break;
      pending.shift();
      const { record, location } = log.append(key, value(raw));
      offsets.set(key, location);
      appended.push(record);
      io.push(
        { kind: 'disk-append', componentId: log.active.id, detail: `${key} at offset ${record.offset}, ${record.bytes} bytes` },
        { kind: 'ram-write', componentId: MAP, detail: `${key} → ${locationText(location)}` },
      );
    }
    const list = appended.map((record) => `${record.key} at ${record.offset}`).join(', ');
    recorder.record({
      title,
      narration: `Append ${list}. Each put is one append to ${log.active.label} plus one map entry naming the segment and the offset. ${extra()}`.trim(),
      focus: { componentId: log.active.id, recordIds: appended.map((record) => record.recordId) },
      touched: [log.active.id, MAP],
      io,
      snippet: { id: 'put', line: 7 },
    });
  };

  const rollOver = (narrationTail: string) => {
    const [key, raw] = pending[0]!;
    const size = textLineBytes(key, value(raw));
    const used = log.active.usedBytes;
    const { closed, opened } = log.roll();
    recorder.record({
      title: `${key} won’t fit, open ${opened.label}`,
      narration: `${describe(key, raw)} is ${size} bytes, and ${used} + ${size} > ${SEGMENT_LIMIT}. ${closed.label} is closed, which makes it read-only for good, and ${opened.label} becomes the active segment. ${narrationTail}`.trim(),
      focus: { componentId: opened.id },
      touched: [closed.id, opened.id],
      io: [{ kind: 'disk-create', componentId: opened.id, detail: opened.label }],
      snippet: { id: 'put', line: 5 },
    });
  };

  fillActive('Fill the first segment');
  rollOver('');
  fillActive(`Fill ${segmentLabel(2)}`, () => `The segment now holds ${log.active.usedBytes} bytes.`);
  rollOver('The same rule, the same result.');
  fillActive(`Fill ${segmentLabel(3)}`, () => `That leaves ${SEGMENT_LIMIT - log.active.usedBytes} bytes free.`);
  rollOver('A segment never holds part of a record.');

  const [key, raw] = pending.shift()!;
  const { record, location } = log.append(key, value(raw));
  const before = offsets.get(key)!;
  offsets.set(key, location);
  recorder.record({
    title: `Update ${key} in the new segment`,
    narration: `${describe(key, raw)} lands at offset ${record.offset} of ${log.active.label}. The map moves ${key} from ${locationText(before)} to ${locationText(location)}; the old record stays in a closed segment, now stale.`,
    focus: { componentId: log.active.id, recordIds: [record.recordId] },
    touched: [log.active.id, segmentId(before.segment), MAP],
    io: [
      { kind: 'disk-append', componentId: log.active.id, detail: `${key} at offset ${record.offset}, ${record.bytes} bytes` },
      { kind: 'ram-write', componentId: MAP, detail: `${key}: ${locationText(before)} → ${locationText(location)}` },
    ],
    snippet: { id: 'put', line: 8 },
  });
  return recorder.steps;
}

export function readFromClosedSegment(): readonly Step[] {
  const { log, offsets } = seedSegments();
  const recorder = new TraceRecorder((): MachineState => ({ ram: [mapView(offsets)], disk: log.views() }));
  const key = 'airpods';
  const location = offsets.get(key)!;
  const file = log.file(location.segment);
  const record = file.latest(key)!;

  recorder.record({
    title: 'Ask the map',
    narration: `The map answers ${key} → ${locationText(location)}: segment ${location.segment}, offset ${location.offset}. An offset alone is no longer enough, because records are spread across several files.`,
    focus: { componentId: MAP },
    io: [{ kind: 'ram-read', componentId: MAP, detail: `${key} → ${locationText(location)}` }],
    snippet: { id: 'get', line: 2 },
  });

  recorder.record({
    title: `Open ${file.label}`,
    narration: `The read picks the file by its segment number. ${file.label} is closed, but closed only means no more appends; it can be read at any time.`,
    focus: { componentId: file.id },
    snippet: { id: 'get', line: 4 },
  });

  recorder.record({
    title: `Seek to ${record.offset}`,
    narration: `One seek to offset ${record.offset} reads ${record.key}:${record.value.display}. Still one RAM lookup and one disk read, exactly as in stage 5.`,
    focus: { componentId: file.id, recordIds: [record.recordId] },
    io: [{ kind: 'disk-random-read', componentId: file.id, detail: `offset ${record.offset}, ${record.bytes} bytes` }],
    snippet: { id: 'get', line: 5 },
  });

  recorder.record({
    title: 'Reads anywhere, writes in one place',
    narration: `Reads can go to any segment, while writes only ever go to ${log.active.label}. That split is what lets a background job work on the closed segments.`,
    focus: { componentId: log.active.id },
    snippet: { id: 'put', line: 7 },
  });
  return recorder.steps;
}

export function compactClosedSegment(): readonly Step[] {
  const { log, offsets } = seedSegments();
  const target = 1;
  const old = log.file(target);
  const temp = new LogFileModel({ id: 'wal-1-copy', label: `${segmentLabel(target)}.tmp`, sizeOf: textLineBytes, status: 'closed' });
  let showTemp = false;
  const recorder = new TraceRecorder(
    (): MachineState => ({ ram: [mapView(offsets)], disk: [...log.views(), ...(showTemp ? [temp.view()] : [])] }),
  );

  recorder.record({
    title: `Pick ${old.label}`,
    narration: `The compaction job only ever works on closed segments. ${old.label} is closed, so nothing will be appended to it while the job reads it.`,
    focus: { componentId: old.id },
    touched: [old.id],
    snippet: { id: 'compact', line: 2 },
  });

  const live = old.records.filter((record) => {
    const latest = offsets.get(record.key);
    return latest?.segment === target && latest.offset === record.offset;
  });
  const stale = old.records.filter((record) => !live.includes(record));
  recorder.record({
    title: 'Find what is stale',
    narration: `For each record the job asks the map where the key’s latest version lives. ${stale.map((record) => `${record.key} points to ${locationText(offsets.get(record.key)!)}`).join(', ')}, not here, so ${stale.map((record) => `${record.key}:${record.value.display}`).join(', ')} is stale.`,
    focus: { componentId: old.id, recordIds: stale.map((record) => record.recordId) },
    touched: [old.id, MAP],
    io: [
      { kind: 'disk-sequential-read', componentId: old.id, detail: `${old.usedBytes} bytes` },
      ...old.records.map((record) => ({ kind: 'ram-read' as const, componentId: MAP, detail: `${record.key} → ${locationText(offsets.get(record.key)!)}` })),
    ],
    snippet: { id: 'compact', line: 9 },
  });

  showTemp = true;
  const copied = live.map((record) => temp.append(record.key, record.value));
  recorder.record({
    title: 'Write a smaller copy',
    narration: `The live records go to a new file: ${copied.map((record) => `${record.key} at ${record.offset}`).join(', ')}, ${temp.usedBytes} bytes instead of ${old.usedBytes}. The original stays readable the whole time.`,
    focus: { componentId: temp.id, recordIds: copied.map((record) => record.recordId) },
    io: [
      { kind: 'disk-create', componentId: temp.id, detail: temp.label },
      ...copied.map((record) => ({ kind: 'disk-append' as const, componentId: temp.id, detail: `${record.key} at offset ${record.offset}` })),
    ],
    snippet: { id: 'compact', line: 10 },
  });

  const [key, raw] = UPDATES.find(([updated]) => updated === 'airpods')!;
  const before = offsets.get(key)!;
  const { record, location } = log.append(key, value(raw));
  offsets.set(key, location);
  recorder.record({
    title: 'A put goes straight through',
    narration: `Meanwhile put ${key} = ${value(raw).display} appends to ${log.active.label} at ${record.offset} without waiting. The job and the writers never touch the same file, so there is nothing to lock.`,
    focus: { componentId: log.active.id, recordIds: [record.recordId] },
    touched: [log.active.id, MAP],
    io: [
      { kind: 'disk-append', componentId: log.active.id, detail: `${key} at offset ${record.offset}, ${record.bytes} bytes` },
      { kind: 'ram-write', componentId: MAP, detail: `${key}: ${locationText(before)} → ${locationText(location)}` },
    ],
    snippet: { id: 'put', line: 7 },
  });

  showTemp = false;
  const swapped = log.replace(target, temp.records);
  for (const copy of swapped.records) offsets.set(copy.key, { segment: target, offset: copy.offset });
  recorder.record({
    title: 'Swap in the copy',
    narration: `The copy is renamed to ${swapped.label} and the old file is deleted. The job rewrites the map entries of the ${swapped.records.length} keys it copied; here their offsets happen to be unchanged because the stale record was last. Either way it is a handful of keys in one small file, not millions.`,
    focus: { componentId: swapped.id, recordIds: swapped.records.map((copy) => copy.recordId) },
    touched: [swapped.id, MAP],
    io: [
      { kind: 'disk-delete', componentId: swapped.id, detail: `old ${swapped.label}, ${old.usedBytes} bytes` },
      ...swapped.records.map((copy) => ({ kind: 'ram-write' as const, componentId: MAP, detail: `${copy.key} → ${locationText({ segment: target, offset: copy.offset })}` })),
    ],
    snippet: { id: 'compact', line: 13 },
  });
  return recorder.steps;
}
