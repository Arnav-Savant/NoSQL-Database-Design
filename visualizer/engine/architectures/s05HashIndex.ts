import { BASE_WRITES } from '@/content/dataset';
import type { MachineState, OffsetRow } from '../model';
import { LogFileModel } from '../structures/logFile';
import { TraceRecorder, type Step } from '../trace';
import { textLineBytes, value } from '../values';

const WAL = 'wal';
const MAP = 'offset-map';

function seeded() {
  const log = new LogFileModel({ id: WAL, label: 'wal.log', sizeOf: textLineBytes });
  const offsets = new Map<string, number>();
  let mapLost = false;
  for (const [key, raw] of BASE_WRITES.slice(0, 4)) offsets.set(key, log.append(key, value(raw)).offset);

  const snapshot = (): MachineState => ({
    ram: mapLost
      ? []
      : [{ kind: 'offset-map', id: MAP, label: 'Offset map', rows: [...offsets].map(([key, offset]): OffsetRow => ({ key, target: `offset ${offset}` })) }],
    disk: [log.view()],
  });
  return {
    log,
    offsets,
    recorder: new TraceRecorder(snapshot),
    loseMap: () => {
      mapLost = true;
      offsets.clear();
    },
    restoreMap: () => {
      mapLost = false;
    },
  };
}

export function putNewKey(): readonly Step[] {
  const { log, offsets, recorder } = seeded();
  recorder.record({
    title: 'Four records, four map entries',
    narration: 'The log on disk holds four records. The offset map in RAM remembers, for each key, the byte offset of its latest record.',
    focus: { componentId: MAP },
    touched: [MAP, WAL],
    snippet: { id: 'put', line: 1 },
  });

  const record = log.append('pixel8', value(4.3));
  recorder.record({
    title: 'Append to the log',
    narration: `pixel8:4.3 goes to the end of the log at offset ${record.offset}. It is a sequential write, the cheapest thing a disk can do.`,
    focus: { componentId: WAL, recordIds: [record.recordId] },
    io: [{ kind: 'disk-append', componentId: WAL, detail: `pixel8 at offset ${record.offset}, ${record.bytes} bytes` }],
    snippet: { id: 'put', line: 2 },
  });

  offsets.set('pixel8', record.offset);
  recorder.record({
    title: 'Remember where it went',
    narration: `The map gains pixel8 → ${record.offset}. That is one write to disk and one to RAM, and the put is done.`,
    focus: { componentId: MAP },
    io: [{ kind: 'ram-write', componentId: MAP, detail: `pixel8 → offset ${record.offset}` }],
    snippet: { id: 'put', line: 3 },
  });
  return recorder.steps;
}

export function updateMacbook(): readonly Step[] {
  const { log, offsets, recorder } = seeded();
  log.append('pixel8', value(4.3));
  offsets.set('pixel8', 47);
  const before = log.latest('macbook');

  recorder.record({
    title: 'Before the update',
    narration: `macbook = 4.9 lives at offset ${before?.offset}. The offset map points straight at it.`,
    focus: { componentId: WAL, recordIds: before ? [before.recordId] : [] },
    touched: [MAP, WAL],
    snippet: { id: 'put', line: 1 },
  });

  const record = log.append('macbook', value('Apple'));
  log.markOlderVersionsStale('macbook');
  recorder.record({
    title: 'Append the new version',
    narration: `The new value is appended at offset ${record.offset}, even though its type changed from a number to a string. The old record is left exactly where it was.`,
    focus: { componentId: WAL, recordIds: [record.recordId] },
    io: [{ kind: 'disk-append', componentId: WAL, detail: `macbook at offset ${record.offset}, ${record.bytes} bytes` }],
    snippet: { id: 'put', line: 2 },
  });

  offsets.set('macbook', record.offset);
  recorder.record({
    title: 'Point the index at it',
    narration: `The map now says macbook → ${record.offset}. The record at ${before?.offset} is stale: nothing points to it, but it still takes up space on disk.`,
    focus: { componentId: MAP },
    io: [{ kind: 'ram-write', componentId: MAP, detail: `macbook: ${before?.offset} → ${record.offset}` }],
    snippet: { id: 'put', line: 3 },
  });
  return recorder.steps;
}

export function readKey(): readonly Step[] {
  const { log, offsets, recorder } = seeded();
  const target = log.latest('iphone12');

  recorder.record({
    title: 'Look the key up in RAM',
    narration: `The hash map answers in constant time on average: iphone12 → ${offsets.get('iphone12')}. No disk access yet.`,
    focus: { componentId: MAP },
    io: [{ kind: 'ram-read', componentId: MAP, detail: 'iphone12' }],
    snippet: { id: 'get', line: 2 },
  });

  recorder.record({
    title: 'One seek, one record',
    narration: `The disk jumps straight to offset ${target?.offset} and reads one record: 4.7. A full scan would have read every record before it.`,
    focus: { componentId: WAL, recordIds: target ? [target.recordId] : [] },
    io: [{ kind: 'disk-random-read', componentId: WAL, detail: `offset ${target?.offset}, ${target?.bytes} bytes` }],
    snippet: { id: 'get', line: 4 },
  });
  return recorder.steps;
}

export function crashAndRebuild(): readonly Step[] {
  const { log, offsets, recorder, loseMap, restoreMap } = seeded();
  const update = log.append('macbook', value('Apple'));
  log.markOlderVersionsStale('macbook');
  offsets.set('macbook', update.offset);

  recorder.record({
    title: 'Running normally',
    narration: 'The log holds five records, one of them a stale macbook. The map points at the latest version of each key.',
    touched: [MAP, WAL],
    snippet: { id: 'rebuild', line: 1 },
  });

  loseMap();
  recorder.record({
    title: 'Power is lost',
    narration: 'RAM is volatile: the offset map is gone. The log is on disk, so every acknowledged write survived.',
    outcome: 'problem',
    focus: { componentId: WAL },
    snippet: { id: 'rebuild', line: 1 },
  });

  restoreMap();
  for (const record of log.records) {
    offsets.set(record.key, record.offset);
    recorder.record({
      title: `Replay ${record.key} at ${record.offset}`,
      narration: record.stale
        ? `Scanning from the start: map ${record.key} → ${record.offset} for now. A later record for the same key will overwrite this entry.`
        : `Map ${record.key} → ${record.offset}. Later records always win, so each key ends up pointing at its newest version.`,
      focus: { componentId: WAL, recordIds: [record.recordId] },
      touched: [WAL, MAP],
      io: [
        { kind: 'disk-sequential-read', componentId: WAL, detail: `${record.key} at ${record.offset}` },
        { kind: 'ram-write', componentId: MAP, detail: `${record.key} → ${record.offset}` },
      ],
      snippet: { id: 'rebuild', line: 3 },
    });
  }

  recorder.record({
    title: 'The map is back',
    narration: 'One sequential pass rebuilt the map. The cost: the bigger the log grows, the longer a restart takes.',
    focus: { componentId: MAP },
    snippet: { id: 'rebuild', line: 4 },
  });
  return recorder.steps;
}
