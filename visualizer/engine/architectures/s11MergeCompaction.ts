import { DEMO_CONFIG } from '@/content/dataset';
import type { MachineState, PositionedRecord, RamComponent, RecordView } from '../model';
import { mergeSteps, type MergeStep } from '../structures/merge';
import { tableId, tableName, tableRecords } from '../structures/sstable';
import { TraceRecorder, type Step } from '../trace';
import { entryBytes } from '../values';
import { afterFourthFlush, afterThirdFlush, type EngineSim, type SSTable, type TableLayout } from './s10SSTableFlush';

type Lanes = Extract<RamComponent, { kind: 'merge-lanes' }>;

const MAP = 'offset-map';

function lanesFor(id: string, label: string, older: SSTable, newer: SSTable): Lanes {
  return {
    kind: 'merge-lanes',
    id,
    label,
    older: { name: older.id, records: tableRecords(older) },
    newer: { name: newer.id, records: tableRecords(newer) },
    output: [],
    olderPointer: 0,
    newerPointer: 0,
  };
}

function applyStep(lanes: Lanes, step: MergeStep): void {
  lanes.olderPointer = step.olderPointer;
  lanes.newerPointer = step.newerPointer;
  lanes.decision = step.decision;
  lanes.output = step.output;
}

function finishLanes(lanes: Lanes): void {
  lanes.olderPointer = lanes.older.records.length;
  lanes.newerPointer = lanes.newer.records.length;
}

/** The output table as it grows: everything emitted so far, packed into blocks by the engine's rule. */
function outputTable(sim: EngineSim, older: SSTable, newer: SSTable, records: readonly RecordView[], status: SSTable['status']): SSTable {
  return { ...sim.buildTable(older.minSeq, newer.maxSeq, records), status };
}

/** Which line of the compact snippet a merge step executes. */
function compactLine(older: readonly RecordView[], newer: readonly RecordView[], step: MergeStep): number {
  const left = older[step.olderPointer];
  const right = newer[step.newerPointer];
  if (left && right && left.key === right.key) return 8;
  return step.emitted?.key === left?.key && left !== undefined ? 6 : 7;
}

function replaceTables(sim: EngineSim, inputs: readonly SSTable[], output: SSTable): void {
  const index = sim.tables.indexOf(inputs[0]!);
  sim.tables.splice(index, 0, output);
}

/** Points every offset-map entry that referred to an input table at the merged table instead. */
function repointOffsets(sim: EngineSim, inputs: readonly SSTable[], output: SSTable): number {
  const inputIds = new Set(inputs.map((table) => table.id));
  let moved = 0;
  for (const record of tableRecords(output)) {
    const location = sim.offsets.get(record.key);
    if (location && inputIds.has(location.table)) {
      sim.offsets.set(record.key, { table: output.id, offset: (record as PositionedRecord).offset });
      moved++;
    }
  }
  return moved;
}

/** A full two-pointer merge of two adjacent tables, recorded one comparison per step. */
function recordMerge(sim: EngineSim, recorder: TraceRecorder, lanes: Lanes, older: SSTable, newer: SSTable, setOutput: (table: SSTable) => void): SSTable {
  const olderRecords = tableRecords(older);
  const newerRecords = tableRecords(newer);
  let output = outputTable(sim, older, newer, [], 'writing');
  replaceTables(sim, [older, newer], output);
  setOutput(output);

  const includesOldest = older.minSeq === 1;
  let first = true;
  let firstEqual = true;
  for (const step of mergeSteps(olderRecords, newerRecords, includesOldest)) {
    applyStep(lanes, step);
    const fresh = outputTable(sim, older, newer, step.output, 'writing');
    sim.tables[sim.tables.indexOf(output)] = fresh;
    output = fresh;
    setOutput(output);
    const emitted = step.emitted;
    const left = olderRecords[step.olderPointer];
    const right = newerRecords[step.newerPointer];
    const equal = left !== undefined && right !== undefined && left.key === right.key;
    let narration: string;
    if (equal) {
      narration = `Both pointers are on ${left.key}. The newer table’s ${right.value.display} goes to the output, the older ${left.value.display} is discarded, and both pointers move on.`;
      if (firstEqual) narration += ' This is the only place a merge drops data.';
      firstEqual = false;
    } else if (left && right) {
      const takeOlder = emitted?.key === left.key;
      narration = `${left.key} (older) against ${right.key} (newer): ${takeOlder ? left.key : right.key} is smaller, so it goes to the output and the ${takeOlder ? 'older' : 'newer'} pointer moves on.`;
    } else {
      narration = `The ${left ? 'newer' : 'older'} table is used up, so ${emitted?.key} is copied straight across with no comparison.`;
    }
    if (first) narration += ' The output is written front to back, like any SSTable.';
    first = false;
    recorder.record({
      title: equal ? `Equal keys: keep the newer ${emitted?.key}` : `Emit ${emitted?.key}`,
      narration,
      focus: { componentId: lanes.id },
      touched: [lanes.id, output.id],
      io: emitted ? [{ kind: 'disk-append', componentId: output.id, detail: `${emitted.key}, ${entryBytes(emitted.key, emitted.value)} bytes` }] : [],
      snippet: { id: 'compact', line: compactLine(olderRecords, newerRecords, step) },
    });
  }
  finishLanes(lanes);
  return output;
}

/** The state after the engine's first compaction: sst-1-1 and sst-2-2 merged into sst-1-2, next to sst-3-3. */
export function afterFirstCompaction(layout?: TableLayout): EngineSim {
  const sim = afterThirdFlush(layout);
  const first = sim.table('sst-1-1')!;
  const second = sim.table('sst-2-2')!;
  let merged: RecordView[] = [];
  for (const step of mergeSteps(tableRecords(first), tableRecords(second), true)) merged = step.output;
  const output = outputTable(sim, first, second, merged, 'live');
  sim.tables = [output, ...sim.tables.filter((table) => table !== first && table !== second)];
  repointOffsets(sim, [first, second], output);
  return sim;
}

export function mergeTwoTables(): readonly Step[] {
  const sim = afterThirdFlush();
  const older = sim.table('sst-1-1')!;
  const newer = sim.table('sst-2-2')!;
  const lanes = lanesFor('merge', 'Merge buffers', older, newer);
  let showLanes = true;
  const recorder = new TraceRecorder((): MachineState => ({ ram: [...(showLanes ? [lanes] : []), sim.offsetMapView()], disk: sim.diskView(false) }));

  recorder.record({
    title: 'Pick the two oldest tables',
    narration: `The third flush left ${sim.tables.length} tables, which is the compaction trigger (${DEMO_CONFIG.compactionTrigger}). The compactor merges the two oldest, ${older.label} and ${newer.label}, reading each from start to end with one pointer per table.`,
    focus: { componentId: lanes.id },
    touched: [lanes.id, older.id, newer.id],
    io: [
      { kind: 'disk-sequential-read', componentId: older.id, detail: `${tableRecords(older).length} entries` },
      { kind: 'disk-sequential-read', componentId: newer.id, detail: `${tableRecords(newer).length} entries` },
    ],
    snippet: { id: 'trigger', line: 3 },
  });

  let output!: SSTable;
  output = recordMerge(sim, recorder, lanes, older, newer, (table) => (output = table));

  output.status = 'live';
  recorder.record({
    title: 'Finish the output',
    narration: `${output.label} is synced and renamed into place: ${tableRecords(output).length} entries from ${tableRecords(older).length} + ${tableRecords(newer).length}. These two tables happened to share no keys, so nothing was dropped; the output holds the union of their keys. Its name says it covers sequences 1 to 2.`,
    focus: { componentId: output.id },
    touched: [lanes.id, output.id],
    io: [{ kind: 'disk-create', componentId: output.id, detail: `${tableRecords(output).length} entries, renamed into place` }],
    snippet: { id: 'compact', line: 10 },
  });

  older.status = 'deleted';
  newer.status = 'deleted';
  showLanes = false;
  const moved = repointOffsets(sim, [older, newer], output);
  recorder.record({
    title: 'Delete the inputs',
    narration: `Only now are the two inputs deleted. ${moved} offset-map entries move to ${output.id}; keys whose newest copy is in sst-3-3 keep pointing there. Reads and writes carried on the whole time: the merge only read immutable files and wrote a new one.`,
    focus: { componentId: MAP },
    touched: [MAP, older.id, newer.id, output.id],
    io: [
      { kind: 'disk-delete', componentId: older.id, detail: older.label },
      { kind: 'disk-delete', componentId: newer.id, detail: newer.label },
      { kind: 'ram-write', componentId: MAP, detail: `${moved} keys → ${output.id}` },
    ],
    snippet: { id: 'compact', line: 11 },
  });
  return recorder.steps;
}

export function newerWins(): readonly Step[] {
  const sim = afterFirstCompaction();
  const older = sim.table('sst-1-2')!;
  const newer = sim.table('sst-3-3')!;
  const lanes = lanesFor('merge', 'Merge buffers', older, newer);
  let showLanes = true;
  const recorder = new TraceRecorder((): MachineState => ({ ram: showLanes ? [lanes] : [], disk: sim.diskView(false) }));

  recorder.record({
    title: 'Merge sst-1-2 with sst-3-3',
    narration: `Later the merged table meets ${newer.label}. This time five keys are in both: airpods, ipad, iphone12, macbook and pixel8. The older table is always on the top lane.`,
    focus: { componentId: lanes.id },
    touched: [lanes.id, older.id, newer.id],
    io: [
      { kind: 'disk-sequential-read', componentId: older.id, detail: `${tableRecords(older).length} entries` },
      { kind: 'disk-sequential-read', componentId: newer.id, detail: `${tableRecords(newer).length} entries` },
    ],
    snippet: { id: 'compact', line: 3 },
  });

  let output!: SSTable;
  output = recordMerge(sim, recorder, lanes, older, newer, (table) => (output = table));

  output.status = 'live';
  older.status = 'deleted';
  newer.status = 'deleted';
  showLanes = false;
  const inCount = tableRecords(older).length + tableRecords(newer).length;
  recorder.record({
    title: 'One table, newest values only',
    narration: `${output.label} holds ${tableRecords(output).length} entries from ${inCount}: ${inCount - tableRecords(output).length} older copies were dropped. The inputs are deleted once the output is safely on disk.`,
    focus: { componentId: output.id },
    touched: [output.id, older.id, newer.id],
    io: [
      { kind: 'disk-create', componentId: output.id, detail: `${tableRecords(output).length} entries` },
      { kind: 'disk-delete', componentId: older.id, detail: older.label },
      { kind: 'disk-delete', componentId: newer.id, detail: newer.label },
    ],
    snippet: { id: 'compact', line: 11 },
  });
  return recorder.steps;
}

function sharedKeys(older: SSTable, newer: SSTable): string[] {
  const newerKeys = new Set(tableRecords(newer).map((record) => record.key));
  return tableRecords(older)
    .map((record) => record.key)
    .filter((key) => newerKeys.has(key));
}

function completeMerge(sim: EngineSim, lanes: Lanes, older: SSTable, newer: SSTable): SSTable {
  let last: MergeStep | undefined;
  for (const step of mergeSteps(tableRecords(older), tableRecords(newer), older.minSeq === 1)) last = step;
  if (last) applyStep(lanes, last);
  finishLanes(lanes);
  const kept = last?.output.length ?? 0;
  const total = tableRecords(older).length + tableRecords(newer).length;
  lanes.decision = kept === total ? `${total} entries in, ${kept} out: no shared keys.` : `${total} entries in, ${kept} out: ${total - kept} older copies dropped.`;
  return outputTable(sim, older, newer, last?.output ?? [], 'live');
}

export function mergeTree(): readonly Step[] {
  const sim = afterFourthFlush();
  const [t1, t2, t3, t4] = sim.tables as [SSTable, SSTable, SSTable, SSTable];
  let lanes: Lanes[] = [];
  const recorder = new TraceRecorder((): MachineState => ({ ram: lanes, disk: sim.diskView(false) }));
  const totalEntries = sim.tables.reduce((total, table) => total + tableRecords(table).length, 0);

  recorder.record({
    title: 'Four flushed tables',
    narration: `Four flushes produced four tables with ${totalEntries} entries between them. Like merge sort, they can be combined bottom up: pairs first, then pairs of results.`,
    focus: { componentId: t1.id },
    touched: sim.tables.map((table) => table.id),
    snippet: { id: 'tree', line: 1 },
  });

  const left = lanesFor('merge-left', 'Thread 1', t1, t2);
  const right = lanesFor('merge-right', 'Thread 2', t3, t4);
  lanes = [left, right];
  let leftOut = outputTable(sim, t1, t2, [], 'writing');
  let rightOut = outputTable(sim, t3, t4, [], 'writing');
  sim.tables = [leftOut, t1, t2, rightOut, t3, t4];
  recorder.record({
    title: 'Two merges at once',
    narration: `${t1.id} with ${t2.id}, and ${t3.id} with ${t4.id}, share no input files, so each pair can be merged on its own thread at the same time.`,
    focus: { componentId: left.id },
    touched: [left.id, right.id, leftOut.id, rightOut.id],
    io: sim.tables.filter((table) => table.status === 'live').map((table) => ({ kind: 'disk-sequential-read' as const, componentId: table.id, detail: `${tableRecords(table).length} entries` })),
    snippet: { id: 'tree', line: 5 },
  });

  leftOut = completeMerge(sim, left, t1, t2);
  rightOut = completeMerge(sim, right, t3, t4);
  for (const table of [t1, t2, t3, t4]) table.status = 'deleted';
  sim.tables = [leftOut, t1, t2, rightOut, t3, t4];
  recorder.record({
    title: 'Both pairs finish',
    narration: `${leftOut.label} and ${rightOut.label} are written and the four inputs deleted. On the right, ${sharedKeys(t3, t4).join(' and ')} were in both inputs and kept only their ${t4.id} values.`,
    focus: { componentId: right.id },
    touched: [left.id, right.id, leftOut.id, rightOut.id, t1.id, t2.id, t3.id, t4.id],
    io: [
      { kind: 'disk-create', componentId: leftOut.id, detail: `${tableRecords(leftOut).length} entries` },
      { kind: 'disk-create', componentId: rightOut.id, detail: `${tableRecords(rightOut).length} entries` },
      ...[t1, t2, t3, t4].map((table) => ({ kind: 'disk-delete' as const, componentId: table.id, detail: table.label })),
    ],
    snippet: { id: 'tree', line: 5 },
  });

  sim.tables = [leftOut, rightOut];
  lanes = [];
  recorder.record({
    title: 'Ranges keep the order',
    narration: `iphone12 is 4.7 in ${leftOut.id} and 4.9 in ${rightOut.id}. Reads check the table with the highest sequence first, and ${rightOut.id} covers up to 4, so 4.9 wins. The two merges could finish in either order; numbering outputs as they finish could make ${leftOut.id} look newer, and reads would return 4.7.`,
    focus: { componentId: leftOut.id, recordIds: [`${leftOut.id}:iphone12`] },
    touched: [leftOut.id, rightOut.id],
    snippet: { id: 'tree', line: 2 },
  });

  const root = lanesFor('merge-root', 'Thread 1', leftOut, rightOut);
  lanes = [root];
  const finalId = tableId(leftOut.minSeq, rightOut.maxSeq);
  let rootOut = outputTable(sim, leftOut, rightOut, [], 'writing');
  sim.tables = [rootOut, leftOut, rightOut];
  recorder.record({
    title: 'Merge the two halves',
    narration: `One level up, the two results are merged the same way into ${tableName(leftOut.minSeq, rightOut.maxSeq)}. Each level halves the number of tables.`,
    focus: { componentId: root.id },
    touched: [root.id, finalId, leftOut.id, rightOut.id],
    io: [leftOut, rightOut].map((table) => ({ kind: 'disk-sequential-read' as const, componentId: table.id, detail: `${tableRecords(table).length} entries` })),
    snippet: { id: 'tree', line: 3 },
  });

  rootOut = completeMerge(sim, root, leftOut, rightOut);
  leftOut.status = 'deleted';
  rightOut.status = 'deleted';
  sim.tables = [rootOut, leftOut, rightOut];
  recorder.record({
    title: 'One table remains',
    narration: `${rootOut.label} holds ${tableRecords(rootOut).length} entries, one per key, down from ${totalEntries} across four tables. Every key has its newest value, and a read now has one table to check.`,
    focus: { componentId: rootOut.id },
    touched: [root.id, rootOut.id, leftOut.id, rightOut.id],
    io: [
      { kind: 'disk-create', componentId: rootOut.id, detail: `${tableRecords(rootOut).length} entries` },
      { kind: 'disk-delete', componentId: leftOut.id, detail: leftOut.label },
      { kind: 'disk-delete', componentId: rightOut.id, detail: rightOut.label },
    ],
    snippet: { id: 'tree', line: 7 },
  });
  return recorder.steps;
}
