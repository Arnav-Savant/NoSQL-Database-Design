import { DEMO_CONFIG } from '@/content/dataset';
import type { MachineState, RecordView } from '../model';
import type { MergeStep } from '../structures/merge';
import { asComponent, locateBlock, tableRecords } from '../structures/sstable';
import { TraceRecorder, type Step } from '../trace';
import { TOMBSTONE, value } from '../values';
import { BUFFER, DEMO_CHAPTERS, LsmSim, MEM, MERGE, shortName, type Table } from './s16CompleteLsm';

const KEY = 'watch';

/** Records of `key` in a table, as record ids for a focus. */
const idsOf = (table: Table, key: string) => tableRecords(table).filter((record) => record.key === key).map((record) => record.recordId);

/** The demo just before its delete: watch = 4.4 cached clean in RAM and stored in sst-000002-000002. */
const beforeDelete = () => LsmSim.atChapter(8, false);

/** Right after the flush that creates sst-000004-000004, before the second merge runs. */
function threeTables(): LsmSim {
  const ops = DEMO_CHAPTERS[9]!;
  const sim = LsmSim.atChapter(9, false, ops.length - 1);
  const last = ops.at(-1);
  if (last?.[0] === 'put') {
    const item = value(last[2]);
    sim.wal.append(last[1], item);
    sim.memtable.putDirty(last[1], item);
    sim.publishFlush(sim.flushTable());
  }
  return sim;
}

export function deleteWatch(): readonly Step[] {
  const sim = beforeDelete();
  const recorder = sim.recorder();
  const onDisk = sim.newestFirst().find((table) => idsOf(table, KEY).length > 0)!;
  const cached = sim.memtable.peek(KEY);

  recorder.record({
    title: 'watch lives in an immutable table',
    narration: `watch = 4.4 is stored in ${onDisk.label} and cached as a clean entry in the memtable. The table can't be edited, so the delete can't simply erase it.`,
    focus: { componentId: onDisk.id, recordIds: idsOf(onDisk, KEY) },
    touched: [onDisk.id, MEM],
    snippet: { id: 'delete', line: 1 },
  });

  const record = sim.wal.append(KEY, TOMBSTONE);
  recorder.record({
    title: 'Append a tombstone to the WAL',
    narration: `A delete is a write. The WAL gets a ${record.bytes}-byte record at offset ${record.offset} whose type byte says "tombstone" and whose value is empty: 8 bytes of checksum and length, 2 of key length, 5 of key, 1 of type and 4 of value length.`,
    focus: { componentId: sim.wal.id, recordIds: [record.recordId] },
    io: [{ kind: 'disk-append', componentId: sim.wal.id, detail: `watch tombstone at offset ${record.offset}, ${record.bytes} bytes` }],
    snippet: { id: 'delete', line: 3 },
  });

  sim.memtable.putDirty(KEY, TOMBSTONE);
  const row = sim.memtable.peek(KEY);
  recorder.record({
    title: 'Store a dirty tombstone',
    narration: `The memtable entry for watch changes from the clean ${cached?.value.display} to a dirty tombstone, shown as "deleted". It is dirty because the delete exists only in the WAL so far; the next flush will write it into a table.`,
    focus: { componentId: MEM, recordIds: row ? [row.recordId] : [] },
    io: [{ kind: 'ram-write', componentId: MEM, detail: 'watch = tombstone, dirty' }],
    snippet: { id: 'delete', line: 4 },
  });

  recorder.record({
    title: 'The old value stays on disk',
    narration: `watch = 4.4 is still in ${onDisk.label}. It is now hidden rather than removed: anything newer for the same key wins, and the tombstone is newer. The delete cost one append and one RAM update, the same as a put.`,
    focus: { componentId: onDisk.id, recordIds: idsOf(onDisk, KEY) },
    touched: [onDisk.id, MEM],
    snippet: { id: 'delete', line: 2 },
  });
  return recorder.steps;
}

export function readWatch(): readonly Step[] {
  const sim = LsmSim.atChapter(8, false, 1);
  let withoutTombstone = false;
  const snapshot = (): MachineState => {
    const state = sim.snapshot();
    if (!withoutTombstone) return state;
    return { ...state, ram: state.ram.map((part) => (part.kind === 'memtable' ? { ...part, rows: part.rows.filter((row) => row.key !== KEY) } : part)) };
  };
  const recorder = new TraceRecorder(snapshot);
  const onDisk = sim.newestFirst().find((table) => idsOf(table, KEY).length > 0)!;
  const row = sim.memtable.get(KEY);

  recorder.record({
    title: 'Check the memtable',
    narration: 'get watch looks in the memtable first, as always, and finds an entry: a tombstone.',
    focus: { componentId: MEM, recordIds: row ? [row.recordId] : [] },
    io: [{ kind: 'ram-read', componentId: MEM, detail: 'watch: tombstone' }],
    snippet: { id: 'get', line: 2 },
  });

  recorder.record({
    title: 'Return not found',
    narration: `A tombstone is the newest entry for watch, so the read stops and returns not found. The watch = 4.4 in ${onDisk.label} is never consulted: no block is read.`,
    focus: { componentId: onDisk.id, recordIds: idsOf(onDisk, KEY) },
    touched: [MEM, onDisk.id],
    snippet: { id: 'get', line: 3 },
  });

  withoutTombstone = true;
  const blockIndex = locateBlock(onDisk, KEY);
  sim.extraRam = [sim.blockBuffer(onDisk, blockIndex)];
  recorder.record({
    title: 'Why removing the entry is not enough',
    narration: `Suppose the delete had only removed watch from the memtable. The read would miss in RAM, fall through to ${onDisk.label}, read block ${blockIndex + 1} and return 4.4: the deleted key would come back.`,
    outcome: 'problem',
    focus: { componentId: onDisk.id, recordIds: idsOf(onDisk, KEY), blockIndex },
    touched: [MEM, onDisk.id, BUFFER],
    io: [{ kind: 'disk-random-read', componentId: onDisk.id, detail: `block ${blockIndex + 1}, ${onDisk.blocks[blockIndex]?.length} bytes` }],
    snippet: { id: 'get', line: 5 },
  });

  withoutTombstone = false;
  sim.extraRam = [];
  recorder.record({
    title: 'The tombstone travels down',
    narration: 'With the tombstone in place, the next flush writes it into a new table, the newest one. A later read that misses the memtable checks that table first, finds the tombstone and stops, so every older value stays hidden.',
    focus: { componentId: MEM, recordIds: row ? [row.recordId] : [] },
    snippet: { id: 'get', line: 8 },
  });
  return recorder.steps;
}

/** The merge state pointing at `key` in both lanes, with the output emitted so far. */
function pointingAt(steps: MergeStep[], index: number): MergeStep {
  const step = steps[index]!;
  return { ...step, output: steps[index - 1]?.output ?? [], decision: `Both pointers are on ${KEY}.` };
}

export function mergeWithOldest(): readonly Step[] {
  const sim = threeTables();
  const recorder = sim.recorder();
  const inputs = sim.compactionInputs()!;
  const [older, newer] = inputs;

  recorder.record({
    title: 'Three tables reach the trigger',
    narration: `The flush that made ${shortName(sim.newestFirst()[0]!)} brought the table count to ${DEMO_CONFIG.compactionTrigger}. ${older.label} holds watch = 4.4; ${newer.label} holds the watch tombstone flushed from the memtable.`,
    focus: { componentId: newer.id, recordIds: idsOf(newer, KEY) },
    touched: [older.id, newer.id],
    snippet: { id: 'merge', line: 1 },
  });

  const drop = sim.canDropTombstones(older);
  const { steps, output } = sim.merge(older, newer, drop);
  sim.extraRam = [sim.mergeLanes(older, newer)];
  recorder.record({
    title: 'This merge includes the oldest table',
    narration: `The compactor merges the two oldest tables. No live table is older than ${shortName(older)}, so if a key is deleted here, no older copy of it can exist anywhere else: tombstones may be dropped.`,
    focus: { componentId: MERGE },
    touched: [MERGE, older.id],
    snippet: { id: 'merge', line: 3 },
  });

  const watchIndex = steps.findIndex((step) => step.decision.startsWith(`Both tables have ${KEY}`));
  const atWatch = pointingAt(steps, watchIndex);
  sim.extraRam = [sim.mergeLanes(older, newer, atWatch)];
  recorder.record({
    title: 'Merge up to watch',
    narration: `${atWatch.output.length} entries have already come through in key order; duplicate keys kept the newer value. Both pointers now sit on watch.`,
    focus: { componentId: MERGE },
    io: [
      { kind: 'disk-sequential-read', componentId: older.id, detail: `${atWatch.olderPointer} entries` },
      { kind: 'disk-sequential-read', componentId: newer.id, detail: `${atWatch.newerPointer} entries` },
    ],
    snippet: { id: 'merge', line: 6 },
  });

  const watchStep = steps[watchIndex]!;
  sim.extraRam = [sim.mergeLanes(older, newer, LsmSim.advanced(watchStep, watchStep.olderPointer + 1, watchStep.newerPointer + 1))];
  recorder.record({
    title: 'The tombstone wins, then is dropped',
    narration: 'The keys are equal, so the newer entry, the tombstone, wins and 4.4 is discarded. Because this merge covers all data older than the tombstone, the tombstone has nothing left to hide and is dropped as well.',
    focus: { componentId: MERGE },
    snippet: { id: 'merge', line: 8 },
  });

  const done = steps.at(-1)!;
  if (watchIndex < steps.length - 1) {
    sim.extraRam = [sim.mergeLanes(older, newer, LsmSim.advanced(done, tableRecords(older).length, tableRecords(newer).length))];
    recorder.record({
      title: 'Finish the merge',
      narration: `The remaining entries are copied across. The output holds ${done.output.length} entries and none of them is watch.`,
      focus: { componentId: MERGE },
      snippet: { id: 'merge', line: 9 },
    });
  }

  sim.extraRam = [];
  sim.replaceTables(inputs, output);
  sim.extraDisk = [
    { ...asComponent(older), status: 'deleted' },
    { ...asComponent(newer), status: 'deleted' },
  ];
  recorder.record({
    title: `Write ${shortName(output!)}`,
    narration: `${output!.label} is written with ${tableRecords(output!).length} entries and the two inputs are deleted. Both watch = 4.4 and its tombstone are gone for good, and the disk space they used is reclaimed.`,
    focus: { componentId: output!.id },
    touched: [output!.id, older.id, newer.id],
    io: [
      { kind: 'disk-create', componentId: output!.id, detail: `${tableRecords(output!).length} entries` },
      { kind: 'disk-delete', componentId: older.id, detail: older.label },
      { kind: 'disk-delete', componentId: newer.id, detail: newer.label },
    ],
    snippet: { id: 'merge', line: 11 },
  });

  sim.extraDisk = [];
  recorder.record({
    title: 'watch reads as not found',
    narration: `A read of watch now misses the memtable and every table: no entry for it exists anywhere, which is exactly what a deleted key should look like.`,
    focus: { componentId: output!.id },
    touched: sim.tables.map((table) => table.id),
    snippet: { id: 'get', line: 10 },
  });
  return recorder.steps;
}

/** A read of `key` through `table`'s sparse index and one block, in a single step's worth of state. */
function readOneTable(sim: LsmSim, table: Table, key: string): { blockIndex: number; record: RecordView | undefined } {
  const blockIndex = locateBlock(table, key);
  sim.extraRam = [sim.blockBuffer(table, blockIndex)];
  return { blockIndex, record: sim.findInTable(table, key) };
}

export function mergeWithoutOldest(): readonly Step[] {
  const sim = threeTables();
  const recorder = sim.recorder();
  const original = [...sim.tables];
  const [oldest, older, newer] = [...sim.tables].sort((left, right) => left.maxSeq - right.maxSeq) as [Table, Table, Table];

  recorder.record({
    title: 'A strategy that skips the oldest table',
    narration: `Suppose a compaction strategy merged ${shortName(older)} and ${shortName(newer)} and left ${shortName(oldest)} alone. ${shortName(older)} holds the watch tombstone, and ${shortName(oldest)} still holds watch = 4.4.`,
    focus: { componentId: oldest.id, recordIds: idsOf(oldest, KEY) },
    touched: [oldest.id, older.id, newer.id],
    snippet: { id: 'merge', line: 2 },
  });

  const dropped = sim.merge(older, newer, true);
  const last = dropped.steps.at(-1)!;
  sim.extraRam = [sim.mergeLanes(older, newer, LsmSim.advanced(last, tableRecords(older).length, tableRecords(newer).length))];
  recorder.record({
    title: 'Drop the tombstone anyway?',
    narration: `If this merge dropped tombstones, watch would simply vanish from the output: ${last.output.length} entries, none of them watch. That looks tidy, but ${shortName(oldest)} is older than both inputs and was not part of the merge.`,
    outcome: 'problem',
    focus: { componentId: MERGE },
    snippet: { id: 'merge', line: 8 },
  });

  sim.extraRam = [];
  sim.replaceTables([older, newer], dropped.output);
  const merged = dropped.output!;
  const first = readOneTable(sim, merged, KEY);
  recorder.record({
    title: `Read watch: ${shortName(merged)} has nothing`,
    narration: `watch is no longer in the memtable, so the read checks ${shortName(merged)} first. Its block ${first.blockIndex + 1} has no watch, with no tombstone to stop the search, so the read moves on.`,
    outcome: 'problem',
    focus: { componentId: merged.id, blockIndex: first.blockIndex },
    touched: [merged.id, BUFFER],
    io: [{ kind: 'disk-random-read', componentId: merged.id, detail: `block ${first.blockIndex + 1}` }],
    snippet: { id: 'get', line: 6 },
  });

  const second = readOneTable(sim, oldest, KEY);
  recorder.record({
    title: 'The deleted key comes back',
    narration: `${shortName(oldest)} has watch = ${second.record?.value.display} in block ${second.blockIndex + 1}, and the read returns it. A key the user deleted is visible again.`,
    outcome: 'problem',
    focus: { componentId: oldest.id, recordIds: idsOf(oldest, KEY), blockIndex: second.blockIndex },
    touched: [oldest.id, BUFFER],
    io: [{ kind: 'disk-random-read', componentId: oldest.id, detail: `block ${second.blockIndex + 1}` }],
    snippet: { id: 'get', line: 8 },
  });

  sim.extraRam = [];
  sim.tables = original;
  const drop = sim.canDropTombstones(older);
  const kept = sim.merge(older, newer, drop);
  const keptLast = kept.steps.at(-1)!;
  sim.extraRam = [sim.mergeLanes(older, newer, LsmSim.advanced(keptLast, tableRecords(older).length, tableRecords(newer).length))];
  recorder.record({
    title: 'The fix: keep the tombstone',
    narration: `The rule checks whether any live table is older than the merge's older input. ${shortName(oldest)} is, so tombstones must be kept: the output has ${keptLast.output.length} entries, including watch = deleted.`,
    focus: { componentId: MERGE },
    snippet: { id: 'merge', line: 3 },
  });

  sim.extraRam = [];
  sim.replaceTables([older, newer], kept.output);
  const safe = kept.output!;
  const check = readOneTable(sim, safe, KEY);
  recorder.record({
    title: 'The tombstone still hides 4.4',
    narration: `Now the read finds the tombstone in ${shortName(safe)} and returns not found; ${shortName(oldest)} is never consulted. The tombstone may only go once a merge also includes ${shortName(oldest)}.`,
    focus: { componentId: safe.id, recordIds: idsOf(safe, KEY), blockIndex: check.blockIndex },
    touched: [safe.id, BUFFER],
    io: [{ kind: 'disk-random-read', componentId: safe.id, detail: `block ${check.blockIndex + 1}` }],
    snippet: { id: 'get', line: 8 },
  });
  return recorder.steps;
}
