import { UPDATES } from '@/content/dataset';
import type { MachineState, RamComponent, RecordView, Value } from '../model';
import { TraceRecorder, type Step } from '../trace';
import { value } from '../values';
import { MAP, locationText, mapView, seedSegments, type Location } from './s07LogSegments';

export const MEMTABLE = 'memtable';

/** A plain hash map in RAM: one entry per key, the newest value wins. No capacity, no dirty flags yet. */
export class SimpleMemtable {
  readonly #entries = new Map<string, RecordView>();
  #version = 0;

  set(key: string, item: Value): RecordView {
    const row: RecordView = { recordId: `mem:${key}:${this.#version++}`, key, value: item };
    this.#entries.delete(key);
    this.#entries.set(key, row);
    return row;
  }

  get(key: string): RecordView | undefined {
    return this.#entries.get(key);
  }

  clear(): void {
    this.#entries.clear();
  }

  get keys(): string[] {
    return [...this.#entries.keys()];
  }

  view(): RamComponent {
    return { kind: 'memtable', id: MEMTABLE, label: 'Memtable', rows: [...this.#entries.values()].map((row) => ({ ...row })) };
  }
}

/** Stage 7's end state plus a memtable mirroring the active segment, wal-000004.log. */
function seeded() {
  const { log, offsets } = seedSegments();
  const memtable = new SimpleMemtable();
  for (const record of log.active.records) memtable.set(record.key, record.value);
  let ramLost = false;
  const snapshot = (): MachineState => ({ ram: ramLost ? [] : [memtable.view(), mapView(offsets)], disk: log.views() });
  return {
    log,
    offsets,
    memtable,
    recorder: new TraceRecorder(snapshot),
    setRamLost: (lost: boolean) => {
      ramLost = lost;
    },
  };
}

const [UPDATE_KEY, UPDATE_RAW] = UPDATES.find(([key]) => key === 'iphone12')!;

/** put() with all three writes; returns what happened so callers can narrate it. */
function putThree(state: ReturnType<typeof seeded>, key: string, item: Value) {
  const { log, offsets, memtable } = state;
  if (!log.fits(key, item)) log.roll();
  const { record, location } = log.append(key, item);
  const row = memtable.set(key, item);
  const before = offsets.get(key);
  offsets.set(key, location);
  return { record, location, row, before };
}

export function putIphone12(): readonly Step[] {
  const state = seeded();
  const { log, offsets, memtable, recorder } = state;
  const active = log.active;
  const item = value(UPDATE_RAW);

  recorder.record({
    title: 'The memtable mirrors the active segment',
    narration: `The memtable is a hash map in RAM holding the contents of the active segment, ${active.label}. Right now that is one key: macbook = ${memtable.get('macbook')?.value.display}.`,
    focus: { componentId: MEMTABLE },
    touched: [MEMTABLE, active.id],
    snippet: { id: 'put', line: 1 },
  });

  const record = log.append(UPDATE_KEY, item);
  recorder.record({
    title: 'Write 1: append to the segment',
    narration: `${UPDATE_KEY}:${item.display} is appended to ${active.label} at offset ${record.record.offset}. This disk write is what makes the put durable.`,
    focus: { componentId: active.id, recordIds: [record.record.recordId] },
    io: [{ kind: 'disk-append', componentId: active.id, detail: `${UPDATE_KEY} at offset ${record.record.offset}, ${record.record.bytes} bytes` }],
    snippet: { id: 'put', line: 3 },
  });

  const row = memtable.set(UPDATE_KEY, item);
  recorder.record({
    title: 'Write 2: the memtable',
    narration: `memtable[${UPDATE_KEY}] = ${item.display}. This RAM write is what makes the next read of ${UPDATE_KEY} fast.`,
    focus: { componentId: MEMTABLE, recordIds: [row.recordId] },
    io: [{ kind: 'ram-write', componentId: MEMTABLE, detail: `${UPDATE_KEY} = ${item.display}` }],
    snippet: { id: 'put', line: 4 },
  });

  const before = offsets.get(UPDATE_KEY)!;
  offsets.set(UPDATE_KEY, record.location);
  recorder.record({
    title: 'Write 3: the offset map',
    narration: `The map moves ${UPDATE_KEY} from ${locationText(before)} to ${locationText(record.location)}. That is three writes per put: one to disk and two to RAM.`,
    focus: { componentId: MAP },
    io: [{ kind: 'ram-write', componentId: MAP, detail: `${UPDATE_KEY}: ${locationText(before)} → ${locationText(record.location)}` }],
    snippet: { id: 'put', line: 5 },
  });
  return recorder.steps;
}

export function readHit(): readonly Step[] {
  const state = seeded();
  const { log, memtable, offsets, recorder } = state;
  putThree(state, UPDATE_KEY, value(UPDATE_RAW));
  const row = memtable.get(UPDATE_KEY)!;

  recorder.record({
    title: 'Check the memtable',
    narration: `get ${UPDATE_KEY} looks in the memtable first, a hash lookup in RAM, and finds ${row.value.display}.`,
    focus: { componentId: MEMTABLE, recordIds: [row.recordId] },
    io: [{ kind: 'ram-read', componentId: MEMTABLE, detail: `${UPDATE_KEY}: hit` }],
    snippet: { id: 'get', line: 2 },
  });

  const onDisk = log.active.latest(UPDATE_KEY)!;
  recorder.record({
    title: 'Return it, no disk access',
    narration: `The memtable mirrors the active segment, which receives every new write, so nothing newer can exist anywhere. The record in ${log.active.label} is there for durability; this read never touches it.`,
    focus: { componentId: log.active.id, recordIds: [onDisk.recordId] },
    touched: [MEMTABLE, log.active.id],
    snippet: { id: 'get', line: 3 },
  });

  recorder.record({
    title: 'A map entry nobody used',
    narration: `The map holds ${UPDATE_KEY} → ${locationText(offsets.get(UPDATE_KEY)!)}, written by the put, yet the read never looked at it. Any key in the active segment is answered by the memtable first.`,
    focus: { componentId: MAP },
    snippet: { id: 'put', line: 5 },
  });
  return recorder.steps;
}

export function readMiss(): readonly Step[] {
  const state = seeded();
  const { log, offsets, recorder } = state;
  putThree(state, UPDATE_KEY, value(UPDATE_RAW));
  const key = 'airpods';
  const location = offsets.get(key)!;
  const file = log.file(location.segment);
  const record = file.latest(key)!;

  recorder.record({
    title: 'Not in the memtable',
    narration: `${key} was last written long before ${log.active.label} opened, so the memtable has no entry for it. A miss costs one hash lookup in RAM.`,
    focus: { componentId: MEMTABLE },
    io: [{ kind: 'ram-read', componentId: MEMTABLE, detail: `${key}: miss` }],
    snippet: { id: 'get', line: 3 },
  });

  recorder.record({
    title: 'Ask the offset map',
    narration: `The map gives ${locationText(location)}: segment ${location.segment}, offset ${location.offset}.`,
    focus: { componentId: MAP },
    io: [{ kind: 'ram-read', componentId: MAP, detail: `${key} → ${locationText(location)}` }],
    snippet: { id: 'get', line: 4 },
  });

  recorder.record({
    title: `Read ${file.label} at ${record.offset}`,
    narration: `One random disk read returns ${record.value.display}. Misses cost what every read cost in stage 7.`,
    focus: { componentId: file.id, recordIds: [record.recordId] },
    io: [{ kind: 'disk-random-read', componentId: file.id, detail: `offset ${record.offset}, ${record.bytes} bytes` }],
    snippet: { id: 'get', line: 6 },
  });

  recorder.record({
    title: 'The hit ratio',
    narration: 'The share of reads answered from the memtable is the hit ratio. If 4 reads in 10 ask for recently written keys, those 4 never touch the disk, and the disk has more time for the other 6 and for compaction.',
    focus: { componentId: MEMTABLE },
    snippet: { id: 'get', line: 2 },
  });
  return recorder.steps;
}

export function restart(): readonly Step[] {
  const state = seeded();
  const { log, offsets, memtable, recorder, setRamLost } = state;
  putThree(state, UPDATE_KEY, value(UPDATE_RAW));

  recorder.record({
    title: 'Running normally',
    narration: `The memtable holds the ${memtable.keys.length} keys of ${log.active.label}; the map holds every key on disk.`,
    touched: [MEMTABLE, MAP],
    snippet: { id: 'restart', line: 1 },
  });

  setRamLost(true);
  memtable.clear();
  offsets.clear();
  recorder.record({
    title: 'Power is lost',
    narration: 'Both the memtable and the offset map lived in RAM, so both are gone. Every segment is on disk, so no acknowledged write is lost.',
    outcome: 'problem',
    focus: { componentId: log.active.id },
    touched: log.files.map((file) => file.id),
    snippet: { id: 'restart', line: 2 },
  });

  setRamLost(false);
  const active = log.active;
  for (const record of active.records) memtable.set(record.key, record.value);
  recorder.record({
    title: 'Rebuild the memtable',
    narration: `Replay ${active.label} from the start into the memtable. Later records overwrite earlier ones, so each key ends up with its newest value.`,
    focus: { componentId: MEMTABLE },
    touched: [active.id, MEMTABLE],
    io: [
      { kind: 'disk-sequential-read', componentId: active.id, detail: `${active.usedBytes} bytes` },
      ...active.records.map((record) => ({ kind: 'ram-write' as const, componentId: MEMTABLE, detail: `${record.key} = ${record.value.display}` })),
    ],
    snippet: { id: 'restart', line: 4 },
  });

  for (const file of log.files) {
    const number = log.numberOf(file);
    const overwritten = file.records.filter((record) => offsets.has(record.key)).map((record) => record.key);
    for (const record of file.records) offsets.set(record.key, { segment: number, offset: record.offset } satisfies Location);
    recorder.record({
      title: `Scan ${file.label}`,
      narration:
        overwritten.length > 0
          ? `Scanning oldest to newest, ${overwritten.join(' and ')} already had an entry from an older segment and now point${overwritten.length === 1 ? 's' : ''} here instead. Newer segments win.`
          : `Every record in ${file.label} becomes a map entry naming segment ${number}. Segments are scanned oldest first, so newer records overwrite older ones.`,
      focus: { componentId: file.id },
      touched: [file.id, MAP],
      io: [
        { kind: 'disk-sequential-read', componentId: file.id, detail: `${file.usedBytes} bytes` },
        { kind: 'ram-write', componentId: MAP, detail: `${file.records.length} entries` },
      ],
      snippet: { id: 'restart', line: 8 },
    });
  }

  recorder.record({
    title: 'Both structures are back',
    narration: `The restart rebuilt two structures: the memtable from one segment, the map from all ${log.files.length}. The map is the expensive one, and it grows with every segment.`,
    focus: { componentId: MAP },
    touched: [MEMTABLE, MAP],
    snippet: { id: 'restart', line: 11 },
  });
  return recorder.steps;
}
