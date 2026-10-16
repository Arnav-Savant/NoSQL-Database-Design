import { BASE_WRITES, UPDATES } from '@/content/dataset';
import type { MachineState, OffsetRow } from '../model';
import { LogFileModel } from '../structures/logFile';
import { TraceRecorder, type Step } from '../trace';
import { textLineBytes, value } from '../values';

const LOG = 'data-log';
const REMEMBERED = 'remembered';

function seeded() {
  const log = new LogFileModel({ id: LOG, label: 'data.log', sizeOf: textLineBytes });
  for (const [key, raw] of BASE_WRITES.slice(0, 4)) log.append(key, value(raw));
  let remembered: OffsetRow[] | undefined;
  const snapshot = (): MachineState => ({
    ram: remembered ? [{ kind: 'offset-map', id: REMEMBERED, label: 'Latest match so far', rows: remembered }] : [],
    disk: [log.view()],
  });
  return {
    log,
    recorder: new TraceRecorder(snapshot),
    remember: (rows: OffsetRow[]) => {
      remembered = rows;
    },
  };
}

const [UPDATE_KEY, UPDATE_RAW] = UPDATES[0]!;

export function appendUpdate(): readonly Step[] {
  const { log, recorder } = seeded();
  const before = log.latest(UPDATE_KEY)!;
  const newValue = value(UPDATE_RAW);

  recorder.record({
    title: `Four records, ending at ${log.usedBytes}`,
    narration: `Each record is a readable line, key:value followed by a newline byte. ${UPDATE_KEY}:${before.value.display} sits at offset ${before.offset} and the file ends at ${log.usedBytes}.`,
    focus: { componentId: LOG, recordIds: [before.recordId] },
    snippet: { id: 'put', line: 1 },
  });

  const record = log.append(UPDATE_KEY, newValue);
  recorder.record({
    title: 'Append the new version',
    narration: `${UPDATE_KEY}:${newValue.display} goes to the end at offset ${record.offset}, ${record.bytes} bytes. An update is just another append: a sequential write, the cheapest thing a disk can do.`,
    focus: { componentId: LOG, recordIds: [record.recordId] },
    io: [{ kind: 'disk-append', componentId: LOG, detail: `${UPDATE_KEY} at offset ${record.offset}, ${record.bytes} bytes` }],
    snippet: { id: 'put', line: 3 },
  });

  log.markOlderVersionsStale(UPDATE_KEY);
  recorder.record({
    title: 'The old version is now stale',
    narration: `${UPDATE_KEY}:${before.value.display} stays at offset ${before.offset}, untouched. The last occurrence of a key is its current value, so the earlier one is stale. Nothing moved, nothing was overwritten, and the value changed from a number to a string freely.`,
    focus: { componentId: LOG, recordIds: [before.recordId] },
    snippet: { id: 'put', line: 4 },
  });
  return recorder.steps;
}

export function scanForLatest(): readonly Step[] {
  const { log, recorder, remember } = seeded();
  log.append(UPDATE_KEY, value(UPDATE_RAW));
  log.markOlderVersionsStale(UPDATE_KEY);
  remember([]);
  let latest: { offset: number; display: string } | undefined;

  for (const record of log.records) {
    const match = record.key === UPDATE_KEY;
    const isLast = record === log.records[log.records.length - 1];
    if (match) {
      latest = { offset: record.offset, display: record.value.display };
      remember([{ key: UPDATE_KEY, target: `${record.value.display} (offset ${record.offset})` }]);
    }
    const narration = match
      ? record.stale
        ? `${UPDATE_KEY} at offset ${record.offset}: remember ${record.value.display}. The scan can’t stop here, because a newer version might appear later in the file.`
        : `Another ${UPDATE_KEY}, at offset ${record.offset}. It replaces the remembered value: ${record.value.display}.`
      : `${record.key} at offset ${record.offset} is not ${UPDATE_KEY}. Keep going${isLast ? '' : ' to the next record'}.`;
    recorder.record({
      title: `Read the record at ${record.offset}`,
      narration,
      focus: { componentId: LOG, recordIds: [record.recordId] },
      touched: match ? [LOG, REMEMBERED] : [LOG],
      io: [
        { kind: 'disk-sequential-read', componentId: LOG, detail: `${record.key} at offset ${record.offset}, ${record.bytes} bytes` },
        ...(match ? [{ kind: 'ram-write' as const, componentId: REMEMBERED, detail: `${UPDATE_KEY} = ${record.value.display}` }] : []),
      ],
      snippet: { id: 'get', line: match ? 4 : 3 },
    });
  }

  recorder.record({
    title: 'End of file: the answer',
    narration: `The scan reached the end at ${log.usedBytes} bytes, so the remembered value is the current one: ${latest?.display}. Every read touches every record, O(n), and the stale record is still taking up space.`,
    focus: { componentId: REMEMBERED },
    snippet: { id: 'get', line: 6 },
  });
  return recorder.steps;
}
