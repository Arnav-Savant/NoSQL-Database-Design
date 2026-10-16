import type { MachineState, PositionedRecord, RamComponent } from '../model';
import { compareKeys } from '../structures/keyOrder';
import { binarySearchProbes, tableRecords } from '../structures/sstable';
import { TraceRecorder, type Step } from '../trace';
import type { SSTable } from './s10SSTableFlush';
import { afterFirstCompaction } from './s11MergeCompaction';

type Buffer = Extract<RamComponent, { kind: 'block-buffer' }>;

const MEMTABLE = 'memtable';
const SEARCH = 'search';

/** sst-1-2 and sst-3-3 on disk, no offset map, and an empty memtable, as right after a restart. */
function setup() {
  const sim = afterFirstCompaction();
  sim.memtable.clear();
  let buffer: Buffer | null = null;
  const recorder = new TraceRecorder((): MachineState => ({ ram: [sim.memtable.view(), ...(buffer ? [buffer] : [])], disk: sim.diskView(false) }));
  return {
    sim,
    recorder,
    setBuffer: (next: Buffer | null) => {
      buffer = next;
    },
  };
}

/** Records one step per binary-search probe over a whole table; returns the match, if any. */
function searchTable(recorder: TraceRecorder, setBuffer: (buffer: Buffer | null) => void, table: SSTable, key: string): PositionedRecord | undefined {
  const records = tableRecords(table) as PositionedRecord[];
  const { probes, found } = binarySearchProbes(records, key);
  probes.forEach((probe, index) => {
    const entry = records[probe.mid]!;
    const order = compareKeys(key, entry.key);
    setBuffer({ kind: 'block-buffer', id: SEARCH, label: `Binary search over ${table.id}`, records, probe });
    let narration = `low=${probe.low}, high=${probe.high}, so mid=${probe.mid}: reading that entry from disk gives ${entry.key}.`;
    let line: number;
    if (order === 0) {
      narration += ` That is the key: ${entry.value.display}.`;
      line = 6;
    } else if (order > 0) {
      narration += ` ${key} sorts after it, so low=${probe.mid + 1}.`;
      line = 7;
    } else {
      narration += ` ${key} sorts before it, so high=${probe.mid - 1}.`;
      line = 8;
    }
    const last = index === probes.length - 1;
    if (last && found === -1) narration += ` low has passed high: ${key} is not in ${table.id}.`;
    if (index === 0) narration = `${table.id} has ${records.length} entries, positions 0 to ${records.length - 1}. ${narration}`;
    recorder.record({
      title: order === 0 ? `Found in ${table.id}` : last && found === -1 ? `Not in ${table.id}` : `Probe ${entry.key} in ${table.id}`,
      narration,
      focus: { componentId: table.id, recordIds: [entry.recordId] },
      touched: [SEARCH, table.id],
      io: [{ kind: 'disk-random-read', componentId: table.id, detail: `entry ${probe.mid} at offset ${entry.offset}, ${entry.bytes} bytes` }],
      snippet: { id: 'search', line },
    });
  });
  return found === -1 ? undefined : records[found];
}

function recordMiss(recorder: TraceRecorder, key: string, extra: string): void {
  recorder.record({
    title: 'Memtable miss',
    narration: `The memtable is empty, as right after a restart, so ${key} must come from disk. There is no offset map any more: ${extra}`,
    focus: { componentId: MEMTABLE },
    io: [{ kind: 'ram-read', componentId: MEMTABLE, detail: `${key}: miss` }],
    snippet: { id: 'get', line: 2 },
  });
}

export function readThroughTables(): readonly Step[] {
  const { sim, recorder, setBuffer } = setup();
  const key = 'iphone11';
  recordMiss(recorder, key, 'the tables are searched from newest to oldest, starting with sst-3-3.');

  let probes = 0;
  let hit: PositionedRecord | undefined;
  for (const table of sim.tablesNewestFirst()) {
    const before = recorder.steps.length;
    hit = searchTable(recorder, setBuffer, table, key);
    probes += recorder.steps.length - before;
    if (hit) break;
  }

  setBuffer(null);
  sim.memtable.putClean(key, hit!.value);
  recorder.record({
    title: 'Cache and return',
    narration: `${key} = ${hit!.value.display} is cached as a clean entry and returned. Finding it took ${probes} probes across two tables, and each probe was a separate random disk read.`,
    focus: { componentId: MEMTABLE, recordIds: [sim.memtable.peek(key)!.recordId] },
    io: [{ kind: 'ram-write', componentId: MEMTABLE, detail: `${key} = ${hit!.value.display}, clean` }],
    snippet: { id: 'get', line: 7 },
  });
  return recorder.steps;
}

export function newestFirstWins(): readonly Step[] {
  const { sim, recorder, setBuffer } = setup();
  const key = 'ipad';
  recordMiss(recorder, key, 'the newest table, sst-3-3, is searched first.');

  const [newest, oldest] = sim.tablesNewestFirst() as [SSTable, SSTable];
  const hit = searchTable(recorder, setBuffer, newest, key)!;

  setBuffer(null);
  sim.memtable.putClean(key, hit.value);
  recorder.record({
    title: 'Stop at the first match',
    narration: `${key} = ${hit.value.display} is returned and cached. The read stops here: ${oldest.id} is never opened, because nothing in an older table can be newer than what was just found.`,
    focus: { componentId: MEMTABLE, recordIds: [sim.memtable.peek(key)!.recordId] },
    io: [{ kind: 'ram-write', componentId: MEMTABLE, detail: `${key} = ${hit.value.display}, clean` }],
    snippet: { id: 'get', line: 8 },
  });

  const stale = tableRecords(oldest).find((record) => record.key === key)!;
  recorder.record({
    title: 'Oldest first would be wrong',
    narration: `${oldest.id} still holds ${key} = ${stale.value.display}. Had the tables been checked oldest first, that entry would have been found first and returned: an outdated value. Newest to oldest, first match wins, is what makes reads correct.`,
    outcome: 'problem',
    focus: { componentId: oldest.id, recordIds: [stale.recordId] },
    snippet: { id: 'get', line: 4 },
  });
  return recorder.steps;
}
