import type { MachineState } from '../model';
import { LogFileModel } from '../structures/logFile';
import { MemtableModel } from '../structures/memtable';
import { TraceRecorder, type Step } from '../trace';
import { value, walRecordBytes } from '../values';

const WAL = 'wal';

/** One write travelling through the finished design: logged on disk first, then held in RAM. */
export function heroWrite(): readonly Step[] {
  const wal = new LogFileModel({ id: WAL, label: 'wal-000001.log', sizeOf: walRecordBytes, capacityBytes: 128 });
  const memtable = new MemtableModel(6);
  for (const [key, raw] of [['iphone11', 4.8], ['iphone12', 4.7], ['macbook', 4.9]] as const) {
    wal.append(key, value(raw));
    memtable.putDirty(key, value(raw));
  }
  const recorder = new TraceRecorder((): MachineState => ({ ram: [memtable.view()], disk: [wal.view()] }));

  recorder.record({
    title: 'A write arrives',
    narration: 'put macbook = "Apple". The value used to be a number; there is no schema to stop it becoming a string.',
    touched: [],
  });

  const record = wal.append('macbook', value('Apple'));
  wal.markOlderVersionsStale('macbook');
  recorder.record({
    title: 'Logged on disk first',
    narration: 'The write is appended to the write-ahead log and forced to disk, so a crash from here on can’t lose it.',
    focus: { componentId: WAL, recordIds: [record.recordId] },
    io: [{ kind: 'disk-append', componentId: WAL, detail: `macbook, ${record.bytes} bytes` }],
  });

  memtable.putDirty('macbook', value('Apple'));
  const slot = memtable.peek('macbook');
  recorder.record({
    title: 'Then kept in memory',
    narration: 'The memtable holds the newest value, marked dirty until it is flushed. Reads of macbook now never touch the disk.',
    focus: { componentId: memtable.id, recordIds: slot ? [slot.recordId] : [] },
    io: [{ kind: 'ram-write', componentId: memtable.id, detail: 'macbook = "Apple", dirty' }],
  });
  return recorder.steps;
}
