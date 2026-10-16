import { BASE_WRITES, UPDATES } from '@/content/dataset';
import type { MachineState, OffsetRow, PositionedRecord } from '../model';
import { LogFileModel } from '../structures/logFile';
import { TraceRecorder, type Step } from '../trace';
import { textLineBytes, value } from '../values';

const WAL = 'wal';
const MAP = 'offset-map';

/** The stage 5 end state: four base records, pixel8, then macbook updated to "Apple". */
function seeded() {
  const log = new LogFileModel({ id: WAL, label: 'wal.log', sizeOf: textLineBytes });
  const offsets = new Map<string, number>();
  let blocked = false;
  const writes = [...BASE_WRITES.slice(0, 4), BASE_WRITES.find(([key]) => key === 'pixel8')!, UPDATES[0]!];
  for (const [key, raw] of writes) offsets.set(key, log.append(key, value(raw)).offset);
  log.markOlderVersionsStale('macbook');

  const snapshot = (): MachineState => ({
    ram: [{ kind: 'offset-map', id: MAP, label: 'Offset map', rows: [...offsets].map(([key, offset]): OffsetRow => ({ key, target: `offset ${offset}` })) }],
    disk: [log.view()],
    blockedWrites: blocked || undefined,
  });
  return {
    log,
    offsets,
    recorder: new TraceRecorder(snapshot),
    setBlocked: (next: boolean) => {
      blocked = next;
    },
  };
}

const ids = (records: readonly PositionedRecord[]) => records.map((record) => record.recordId);

export function compactLiveFile(): readonly Step[] {
  const { log, offsets, recorder, setBlocked } = seeded();
  const stale = log.records.find((record) => record.stale)!;
  const latestMacbook = log.latest('macbook')!;

  recorder.record({
    title: 'One file, one stale record',
    narration: `The log ends at byte ${log.usedBytes}. macbook appears twice, and only the record at ${latestMacbook.offset} is current. Compaction is a background job that removes stale records so the file stops growing without limit.`,
    focus: { componentId: WAL },
    touched: [WAL, MAP],
    snippet: { id: 'compact', line: 1 },
  });

  setBlocked(true);
  recorder.record({
    title: 'Lock the file and find the stale record',
    narration: `The job takes a write lock, because it is about to change the same file puts append to. Scanning from the start, it reaches macbook at ${stale.offset}, but the map says macbook → ${offsets.get('macbook')}, so this record is stale.`,
    focus: { componentId: WAL, recordIds: [stale.recordId] },
    touched: [WAL, MAP],
    io: [
      { kind: 'disk-sequential-read', componentId: WAL, detail: `scan from offset 0 to ${stale.offset}` },
      { kind: 'ram-read', componentId: MAP, detail: `macbook → ${offsets.get('macbook')}` },
    ],
    snippet: { id: 'compact', line: 6 },
  });

  const { moved } = log.compactInPlace();
  const movedRecords = log.records.filter((record) => moved.some((move) => move.key === record.key));
  recorder.record({
    title: `Remove ${stale.bytes} bytes, shift the rest`,
    narration: `Removing ${stale.bytes} bytes moves every later record ${stale.bytes} bytes to the left: ${moved.map((move) => `${move.key} ${move.from} → ${move.to}`).join(', ')}. The map still holds the old offsets, so right now it points at the wrong bytes.`,
    outcome: 'problem',
    focus: { componentId: WAL, recordIds: ids(movedRecords) },
    io: moved.map((move) => ({ kind: 'disk-overwrite' as const, componentId: WAL, detail: `${move.key} rewritten at ${move.to}` })),
    snippet: { id: 'compact', line: 7 },
  });

  for (const move of moved) offsets.set(move.key, move.to);
  recorder.record({
    title: `Rewrite ${moved.length} map entries`,
    narration: `Every shifted key needs a new offset: ${moved.length} map updates for one removed record. In a large file, removing one record near the start shifts millions of records, and each of them needs its map entry rewritten.`,
    focus: { componentId: MAP },
    io: moved.map((move) => ({ kind: 'ram-write' as const, componentId: MAP, detail: `${move.key}: ${move.from} → ${move.to}` })),
    snippet: { id: 'compact', line: 8 },
  });

  const [airpodsKey, airpodsRaw] = BASE_WRITES.find(([key]) => key === 'airpods')!;
  recorder.record({
    title: `A put for ${airpodsKey} has to wait`,
    narration: `put ${airpodsKey} = ${airpodsRaw} arrives while the job is still rewriting the file. Appends go to the end of the file, and the end is moving, so the write waits for the lock.`,
    outcome: 'problem',
    focus: { componentId: WAL },
    snippet: { id: 'put', line: 2 },
  });

  setBlocked(false);
  const appended = log.append(airpodsKey, value(airpodsRaw));
  offsets.set(airpodsKey, appended.offset);
  recorder.record({
    title: 'The job finishes, the put lands',
    narration: `Once the job truncates the file to ${appended.offset} bytes and releases the lock, ${airpodsKey} is appended at ${appended.offset}. The write was correct, just late: on a huge file it would wait for the whole rewrite.`,
    focus: { componentId: WAL, recordIds: [appended.recordId] },
    touched: [WAL, MAP],
    io: [
      { kind: 'disk-append', componentId: WAL, detail: `${airpodsKey} at offset ${appended.offset}, ${appended.bytes} bytes` },
      { kind: 'ram-write', componentId: MAP, detail: `${airpodsKey} → ${appended.offset}` },
    ],
    snippet: { id: 'put', line: 3 },
  });

  const chunk = log.records.slice(0, 2);
  recorder.record({
    title: 'Work chunk by chunk',
    narration: `A real log is far too large to rewrite in one go, so the job must take a piece at a time, such as these first ${chunk.reduce((total, record) => total + record.bytes, 0)} bytes, and keep the map consistent after each one. It still blocks writes for every chunk, because the chunks belong to the file that writes go to.`,
    outcome: 'problem',
    focus: { componentId: WAL, recordIds: ids(chunk) },
    snippet: { id: 'chunks', line: 3 },
  });
  return recorder.steps;
}

export function readDuringCompaction(): readonly Step[] {
  const { log, offsets, recorder, setBlocked } = seeded();
  const key = 'ipad';
  const before = log.latest(key)!;
  const seenOffset = offsets.get(key)!;

  recorder.record({
    title: `Look up ${key}`,
    narration: `A read for ${key} asks the map and gets offset ${seenOffset}. At this moment that is correct.`,
    focus: { componentId: WAL, recordIds: [before.recordId] },
    touched: [MAP, WAL],
    io: [{ kind: 'ram-read', componentId: MAP, detail: `${key} → ${seenOffset}` }],
    snippet: { id: 'get', line: 2 },
  });

  setBlocked(true);
  const { removed, moved } = log.compactInPlace();
  const shifted = moved.find((move) => move.key === key)!;
  recorder.record({
    title: 'Compaction shifts the bytes',
    narration: `Before the read reaches the disk, the job removes the stale macbook record. ${key} moves from ${shifted.from} to ${shifted.to}, but the reader is already holding ${seenOffset}.`,
    outcome: 'problem',
    focus: { componentId: WAL, recordIds: [before.recordId] },
    io: [
      { kind: 'disk-overwrite', componentId: WAL, detail: `removed ${removed.map((record) => `${record.key} (${record.bytes} bytes)`).join(', ')}` },
      ...moved.map((move) => ({ kind: 'disk-overwrite' as const, componentId: WAL, detail: `${move.key} rewritten at ${move.to}` })),
    ],
    snippet: { id: 'compact', line: 7 },
  });

  const victim = log.records.find((record) => record.offset <= seenOffset && seenOffset < record.offset + record.bytes)!;
  const line = `${victim.key}:${victim.value.display}\n`;
  const garbage = line.slice(seenOffset - victim.offset).replace('\n', '');
  recorder.record({
    title: `Read at ${seenOffset}: the wrong bytes`,
    narration: `Offset ${seenOffset} now falls ${seenOffset - victim.offset} bytes into the ${victim.key} record, so the read returns "${garbage}". Without coordination with the job, a read can return part of another key's record.`,
    outcome: 'problem',
    focus: { componentId: WAL, recordIds: [victim.recordId] },
    io: [{ kind: 'disk-random-read', componentId: WAL, detail: `offset ${seenOffset}: lands inside ${victim.key}` }],
    snippet: { id: 'get', line: 4 },
  });

  for (const move of moved) offsets.set(move.key, move.to);
  setBlocked(false);
  recorder.record({
    title: 'Fix the map, then retry',
    narration: `The job rewrites the map: ${key} → ${shifted.to}. Reads must now wait for, or retry after, every map rewrite, so compaction slows reads as well as writes.`,
    focus: { componentId: MAP },
    touched: [MAP, WAL],
    io: moved.map((move) => ({ kind: 'ram-write' as const, componentId: MAP, detail: `${move.key}: ${move.from} → ${move.to}` })),
    snippet: { id: 'compact', line: 8 },
  });

  const after = log.latest(key)!;
  recorder.record({
    title: `Read at ${after.offset}`,
    narration: `The retried read seeks to ${after.offset} and gets ${after.value.display}. Correct, but only because the reader and the job took turns.`,
    focus: { componentId: WAL, recordIds: [after.recordId] },
    io: [
      { kind: 'ram-read', componentId: MAP, detail: `${key} → ${after.offset}` },
      { kind: 'disk-random-read', componentId: WAL, detail: `offset ${after.offset}, ${after.bytes} bytes` },
    ],
    snippet: { id: 'get', line: 4 },
  });
  return recorder.steps;
}
