import { UPDATES } from '@/content/dataset';
import type { MachineState, Value } from '../model';
import { TraceRecorder, type Step } from '../trace';
import { textLineBytes, value } from '../values';
import { MAP, SEGMENT_LIMIT, locationText, mapView, seedSegments, type Location } from './s07LogSegments';
import { MEMTABLE, SimpleMemtable } from './s08Memtable';

const KINDLE = 'kindle';
const PAPERWHITE = value('Paperwhite');

/**
 * Stage 7's segments, but the offset map was only ever filled in bulk as segments closed,
 * so it covers wal-000001 to wal-000003 and knows nothing about the active wal-000004.
 */
function seeded() {
  const { log } = seedSegments();
  const offsets = new Map<string, Location>();
  const bulkInsert = (segment: number) => {
    const file = log.file(segment);
    for (const record of file.records) offsets.set(record.key, { segment, offset: record.offset });
    return file;
  };
  for (const file of log.files.slice(0, -1)) bulkInsert(log.numberOf(file));
  const memtable = new SimpleMemtable();
  for (const record of log.active.records) memtable.set(record.key, record.value);
  const snapshot = (): MachineState => ({ ram: [memtable.view(), mapView(offsets, 'Offset map (closed segments)')], disk: log.views() });
  return { log, offsets, memtable, bulkInsert, recorder: new TraceRecorder(snapshot) };
}

/** put() with two writes: the active segment and the memtable. */
function putTwo(state: ReturnType<typeof seeded>, key: string, item: Value) {
  const record = state.log.append(key, item).record;
  const row = state.memtable.set(key, item);
  return { record, row };
}

export function putKindle(): readonly Step[] {
  const state = seeded();
  const { log, offsets, memtable, recorder } = state;
  const active = log.active;

  recorder.record({
    title: 'The map covers closed segments only',
    narration: `The memtable mirrors ${active.label}; the offset map covers the closed segments and nothing else. Notice macbook → ${locationText(offsets.get('macbook')!)}: an old location, because the newer record lives in the active segment.`,
    focus: { componentId: MAP },
    touched: [MAP, MEMTABLE],
    snippet: { id: 'put', line: 1 },
  });

  const record = log.append(KINDLE, PAPERWHITE).record;
  recorder.record({
    title: 'Write 1: append to the segment',
    narration: `${KINDLE}:${PAPERWHITE.display} is appended to ${active.label} at offset ${record.offset}, ${record.bytes} bytes. The put is now durable.`,
    focus: { componentId: active.id, recordIds: [record.recordId] },
    io: [{ kind: 'disk-append', componentId: active.id, detail: `${KINDLE} at offset ${record.offset}, ${record.bytes} bytes` }],
    snippet: { id: 'put', line: 3 },
  });

  const row = memtable.set(KINDLE, PAPERWHITE);
  recorder.record({
    title: 'Write 2: the memtable',
    narration: `memtable[${KINDLE}] = ${PAPERWHITE.display}. Reads of ${KINDLE} are now answered from RAM.`,
    focus: { componentId: MEMTABLE, recordIds: [row.recordId] },
    io: [{ kind: 'ram-write', componentId: MEMTABLE, detail: `${KINDLE} = ${PAPERWHITE.display}` }],
    snippet: { id: 'put', line: 4 },
  });

  recorder.record({
    title: 'The offset map is untouched',
    narration: `The map still says ${KINDLE} → ${locationText(offsets.get(KINDLE)!)}, the old 4.1. That is fine: no read will consult it while ${KINDLE} is in the memtable. Two writes instead of three.`,
    focus: { componentId: MAP },
    snippet: { id: 'put', line: 5 },
  });
  return recorder.steps;
}

export function readMemtableFirst(): readonly Step[] {
  const state = seeded();
  const { log, offsets, memtable, recorder } = state;
  putTwo(state, KINDLE, PAPERWHITE);
  const fresh = memtable.get(KINDLE)!;

  recorder.record({
    title: `get ${KINDLE}: memtable hit`,
    narration: `The memtable has ${KINDLE} = ${fresh.value.display}. It mirrors the active segment, so this is the newest value and the read is done.`,
    focus: { componentId: MEMTABLE, recordIds: [fresh.recordId] },
    io: [{ kind: 'ram-read', componentId: MEMTABLE, detail: `${KINDLE}: hit` }],
    snippet: { id: 'get', line: 3 },
  });

  const staleLocation = offsets.get(KINDLE)!;
  const staleRecord = log.file(staleLocation.segment).latest(KINDLE)!;
  recorder.record({
    title: 'Why the order matters',
    narration: `The map’s entry for ${KINDLE} leads to ${staleRecord.key}:${staleRecord.value.display} at ${locationText(staleLocation)}, which is out of date. Checking the memtable first is what makes skipping the map update safe.`,
    focus: { componentId: `wal-${staleLocation.segment}`, recordIds: [staleRecord.recordId] },
    touched: [MAP, `wal-${staleLocation.segment}`],
    snippet: { id: 'get', line: 2 },
  });

  const key = 'galaxy';
  recorder.record({
    title: `get ${key}: memtable miss`,
    narration: `${key} isn’t in the memtable, so it wasn’t written since ${log.active.label} opened. Its newest record must be in a closed segment.`,
    focus: { componentId: MEMTABLE },
    io: [{ kind: 'ram-read', componentId: MEMTABLE, detail: `${key}: miss` }],
    snippet: { id: 'get', line: 3 },
  });

  const location = offsets.get(key)!;
  recorder.record({
    title: 'Ask the map',
    narration: `The map covers every closed segment and answers ${key} → ${locationText(location)}.`,
    focus: { componentId: MAP },
    io: [{ kind: 'ram-read', componentId: MAP, detail: `${key} → ${locationText(location)}` }],
    snippet: { id: 'get', line: 4 },
  });

  const file = log.file(location.segment);
  const record = file.latest(key)!;
  recorder.record({
    title: `Read ${file.label} at ${record.offset}`,
    narration: `One disk read returns ${record.value.display}. Reads cost exactly what they did in stage 8.`,
    focus: { componentId: file.id, recordIds: [record.recordId] },
    io: [{ kind: 'disk-random-read', componentId: file.id, detail: `offset ${record.offset}, ${record.bytes} bytes` }],
    snippet: { id: 'get', line: 6 },
  });
  return recorder.steps;
}

export function segmentCloses(): readonly Step[] {
  const state = seeded();
  const { log, offsets, memtable, bulkInsert, recorder } = state;
  putTwo(state, KINDLE, PAPERWHITE);
  const [key, raw] = UPDATES.find(([updated]) => updated === 'iphone12')!;
  const item = value(raw);
  const size = textLineBytes(key, item);
  const full = log.active;

  recorder.record({
    title: `${key} won’t fit`,
    narration: `put ${key} = ${item.display} needs ${size} bytes. ${full.label} holds ${full.usedBytes}, and ${full.usedBytes} + ${size} > ${SEGMENT_LIMIT}, so the segment must close first.`,
    focus: { componentId: full.id },
    touched: [full.id, MEMTABLE],
    snippet: { id: 'put', line: 2 },
  });

  const { opened } = log.roll();
  recorder.record({
    title: `Close it, open ${opened.label}`,
    narration: `${full.label} becomes read-only and ${opened.label} becomes the active segment. For a moment the memtable is the only RAM structure that covers ${full.label}’s keys, so it can’t be cleared yet.`,
    focus: { componentId: opened.id },
    touched: [full.id, opened.id],
    io: [{ kind: 'disk-create', componentId: opened.id, detail: opened.label }],
    snippet: { id: 'roll', line: 4 },
  });

  const closedNumber = log.numberOf(full);
  const changes = full.records.map((record) => `${record.key} → ${locationText({ segment: closedNumber, offset: record.offset })}`);
  bulkInsert(closedNumber);
  recorder.record({
    title: 'One bulk update',
    narration: `Every record in ${full.label} goes into the map at once: ${changes.join(', ')}. One batched update at roll-over replaces a map write on every put.`,
    focus: { componentId: MAP },
    touched: [full.id, MAP],
    io: [
      { kind: 'disk-sequential-read', componentId: full.id, detail: `${full.usedBytes} bytes` },
      { kind: 'ram-write', componentId: MAP, detail: `bulk: ${full.records.length} entries` },
    ],
    snippet: { id: 'roll', line: 6 },
  });

  recorder.record({
    title: 'The memtable is a clean copy',
    narration: `Right now the memtable holds exactly ${full.label}’s data, one entry per key with the newest value. A busy segment would hold several versions of a hot key; the memtable never does.`,
    focus: { componentId: MEMTABLE },
    touched: [MEMTABLE, full.id],
    snippet: { id: 'roll', line: 6 },
  });

  memtable.clear();
  recorder.record({
    title: 'Start an empty memtable',
    narration: `The map now covers ${full.label}, so the memtable can be emptied to mirror the new, empty ${opened.label}.`,
    focus: { componentId: MEMTABLE },
    io: [{ kind: 'ram-write', componentId: MEMTABLE, detail: 'clear' }],
    snippet: { id: 'roll', line: 7 },
  });

  const { record, row } = putTwo(state, key, item);
  recorder.record({
    title: `Finish the put of ${key}`,
    narration: `${key}:${item.display} lands at offset ${record.offset} of ${opened.label} and in the memtable: two writes as usual. The map still points ${key} at ${locationText(offsets.get(key)!)}, and the memtable shadows it.`,
    focus: { componentId: opened.id, recordIds: [record.recordId] },
    touched: [opened.id, MEMTABLE],
    io: [
      { kind: 'disk-append', componentId: opened.id, detail: `${key} at offset ${record.offset}, ${record.bytes} bytes` },
      { kind: 'ram-write', componentId: MEMTABLE, detail: `${key} = ${row.value.display}` },
    ],
    snippet: { id: 'put', line: 4 },
  });
  return recorder.steps;
}
