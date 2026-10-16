import { ABSENT_KEY, BASE_WRITES, DEMO_CONFIG, FALSE_POSITIVE_PROBE, UPDATES } from '@/content/dataset';
import type { DiskComponent, MachineState, RamComponent, RecordView, Value } from '../model';
import { BloomModel } from '../structures/bloom';
import { LogFileModel } from '../structures/logFile';
import { MemtableModel } from '../structures/memtable';
import { mergeSteps, type MergeStep } from '../structures/merge';
import { asComponent, binarySearchProbes, buildSSTable, locateBlock, tableName, tableRecords } from '../structures/sstable';
import { TraceRecorder, type Step } from '../trace';
import { entryBytes, TOMBSTONE, value, walRecordBytes, type RawValue } from '../values';

/* ------------------------------------------------------------------------------------------------
 * A step-by-step model of the engines' LsmStore with the demo configuration. Stages 14 to 16 share
 * it, so every size, block boundary, Bloom bit and file name matches `node demo/main.js`.
 * --------------------------------------------------------------------------------------------- */

export type Table = Extract<DiskComponent, { kind: 'sstable' }> & { bloomModel?: BloomModel };
type Op = readonly ['put', string, RawValue] | readonly ['delete', string] | readonly ['get', string];

export const MEM = 'memtable';
export const BUFFER = 'block-buffer';
export const MERGE = 'merge';

const put = ([key, raw]: readonly [string, RawValue]): Op => ['put', key, raw];

/** The demo's operations, chapter by chapter, exactly as the engines' scenario runs them. */
export const DEMO_CHAPTERS: Readonly<Record<number, readonly Op[]>> = {
  2: BASE_WRITES.slice(0, 3).map(put),
  3: [put(UPDATES[0]!), put(BASE_WRITES[3]!)],
  5: [['get', 'macbook'], ['get', 'iphone11']],
  6: [...BASE_WRITES.slice(4).map(put), ...UPDATES.slice(1).map(put)],
  7: [['get', 'watch'], ['get', ABSENT_KEY], ['get', FALSE_POSITIVE_PROBE]],
  8: [['delete', 'watch'], ['get', 'watch']],
  9: [
    ['put', 'pixel8', 4.4],
    ['put', 'kindle', 'Paperwhite'],
    ['put', 'galaxy', false],
    ['put', 'iphone11', 4.7],
    ['put', 'airpods', 4.6],
    ['put', 'ipad', 4.5],
  ],
  10: [
    ['put', 'galaxy', 4.3],
    ['put', 'kindle', 4.2],
  ],
};

/** The bytes of the half-written record the demo appends before it reopens the store. */
export const TORN_BYTES = 5;

export const walName = (sequence: number) => `wal-${String(sequence).padStart(6, '0')}.log`;

export const shortName = (table: { minSeq: number; maxSeq: number }) => tableName(table.minSeq, table.maxSeq).replace('.sst', '');

export class LsmSim {
  readonly memtable = new MemtableModel(DEMO_CONFIG.memtableCapacity, MEM, 'Memtable');
  wal: LogFileModel;
  oldestUnflushed = 1;
  /** Live tables, oldest first. */
  tables: Table[] = [];
  /** Transient components shown for a step or two: merge lanes, a block read, a deleted file. */
  extraRam: RamComponent[] = [];
  extraDisk: DiskComponent[] = [];
  ramLost = false;
  /** Tables whose sparse index and Bloom filter are not in RAM yet (during recovery). */
  unloaded = new Set<string>();

  constructor(readonly withBloom: boolean) {
    this.wal = LsmSim.openWal(1);
  }

  static openWal(sequence: number): LogFileModel {
    return new LogFileModel({ id: `wal-${sequence}`, label: walName(sequence), sizeOf: walRecordBytes, capacityBytes: DEMO_CONFIG.walMaxBytes });
  }

  get walSequence(): number {
    return Number(this.wal.id.slice(4));
  }

  newestFirst(): Table[] {
    return [...this.tables].sort((left, right) => right.maxSeq - left.maxSeq);
  }

  snapshot = (): MachineState => ({
    ram: this.ramLost ? [...this.extraRam] : [this.memtable.view(), ...this.extraRam],
    disk: [
      this.wal.view(),
      ...this.newestFirst().map((table) => {
        const component = asComponent(table);
        return this.unloaded.has(table.id) ? { ...component, showSparseIndex: false, bloom: undefined } : component;
      }),
      ...this.extraDisk,
    ],
  });

  recorder(): TraceRecorder {
    return new TraceRecorder(this.snapshot);
  }

  buildTable(minSeq: number, maxSeq: number, records: readonly RecordView[]): Table {
    return buildSSTable({
      minSeq,
      maxSeq,
      records,
      blockSizeBytes: DEMO_CONFIG.blockSizeBytes,
      sizeOf: entryBytes,
      showBlocks: true,
      showSparseIndex: true,
      bloomBitsPerKey: this.withBloom ? DEMO_CONFIG.bloomBitsPerKey : undefined,
    });
  }

  flushIsDue(): boolean {
    return this.wal.usedBytes >= DEMO_CONFIG.walMaxBytes || this.memtable.isSaturatedWithDirty();
  }

  flushReason(): string {
    return this.memtable.isSaturatedWithDirty() ? 'the memtable is full of dirty entries' : 'the WAL reached its size limit';
  }

  /** Writes the dirty entries as a new table; the caller decides when to publish it. */
  flushTable(): Table {
    return this.buildTable(this.oldestUnflushed, this.walSequence, this.memtable.dirtyRecordsSorted());
  }

  /** Publishes the flushed table, marks the memtable clean, and swaps the WAL. Returns the old WAL. */
  publishFlush(table: Table): LogFileModel {
    this.tables.push(table);
    this.memtable.markAllClean();
    const old = this.wal;
    old.status = 'deleted';
    this.wal = LsmSim.openWal(this.walSequence + 1);
    this.oldestUnflushed = this.walSequence;
    return old;
  }

  compactionInputs(): [Table, Table] | null {
    if (this.tables.length < DEMO_CONFIG.compactionTrigger) return null;
    const [older, newer] = [...this.tables].sort((left, right) => left.maxSeq - right.maxSeq);
    return older && newer ? [older, newer] : null;
  }

  /** Same rule as the engines: drop tombstones only if no live table is older than this merge. */
  canDropTombstones(older: Table): boolean {
    return this.tables.every((table) => table.minSeq >= older.minSeq);
  }

  merge(older: Table, newer: Table, dropTombstones: boolean): { steps: MergeStep[]; output: Table | null } {
    const steps = [...mergeSteps(tableRecords(older), tableRecords(newer), dropTombstones)];
    const records = steps.at(-1)?.output ?? [];
    return { steps, output: records.length > 0 ? this.buildTable(older.minSeq, newer.maxSeq, records) : null };
  }

  replaceTables(inputs: readonly Table[], output: Table | null): void {
    this.tables = [...this.tables.filter((table) => !inputs.includes(table)), ...(output ? [output] : [])];
  }

  mergeLanes(older: Table, newer: Table, step?: MergeStep): RamComponent {
    return {
      kind: 'merge-lanes',
      id: MERGE,
      label: `Merging ${shortName(older)} and ${shortName(newer)}`,
      older: { name: shortName(older), records: tableRecords(older) },
      newer: { name: shortName(newer), records: tableRecords(newer) },
      output: step?.output ?? [],
      olderPointer: step ? step.olderPointer : 0,
      newerPointer: step ? step.newerPointer : 0,
      decision: step?.decision,
    };
  }

  /** After a step's emit, the pointers have moved past the compared records. */
  static advanced(step: MergeStep, older: number, newer: number): MergeStep {
    return { ...step, olderPointer: older, newerPointer: newer };
  }

  // Silent operations, used to fast-forward to the state a walkthrough starts from.

  write(key: string, item: Value): void {
    this.wal.append(key, item);
    this.memtable.putDirty(key, item);
    if (this.flushIsDue()) this.flushAndCompact();
  }

  flushAndCompact(): void {
    this.publishFlush(this.flushTable());
    this.compact();
  }

  compact(): void {
    for (let inputs = this.compactionInputs(); inputs !== null; inputs = this.compactionInputs()) {
      const [older, newer] = inputs;
      const { output } = this.merge(older, newer, this.canDropTombstones(older));
      this.replaceTables(inputs, output);
    }
  }

  read(key: string): Value | undefined {
    const cached = this.memtable.get(key);
    if (cached) return cached.value.type === 'tombstone' ? undefined : cached.value;
    for (const table of this.newestFirst()) {
      if (table.bloomModel && !table.bloomModel.mightContain(key)) continue;
      const record = this.findInTable(table, key);
      if (!record) continue;
      this.memtable.putClean(key, record.value);
      return record.value.type === 'tombstone' ? undefined : record.value;
    }
    return undefined;
  }

  findInTable(table: Table, key: string): RecordView | undefined {
    const block = table.blocks[locateBlock(table, key)];
    return block?.records.find((record) => record.key === key);
  }

  run(ops: readonly Op[]): void {
    for (const op of ops) {
      if (op[0] === 'put') this.write(op[1], value(op[2]));
      else if (op[0] === 'delete') this.write(op[1], TOMBSTONE);
      else this.read(op[1]);
    }
  }

  /** Runs every demo chapter before `chapter`, then the first `extraOps` operations of it. */
  static atChapter(chapter: number, withBloom: boolean, extraOps = 0): LsmSim {
    const sim = new LsmSim(withBloom);
    for (const [number, ops] of Object.entries(DEMO_CHAPTERS)) {
      if (Number(number) < chapter) sim.run(ops);
      else if (Number(number) === chapter) sim.run(ops.slice(0, extraOps));
    }
    return sim;
  }

  blockBuffer(table: Table, blockIndex: number, probe?: { low: number; high: number; mid: number }): RamComponent {
    return {
      kind: 'block-buffer',
      id: BUFFER,
      label: `Block ${blockIndex + 1} of ${shortName(table)}`,
      records: (table.blocks[blockIndex]?.records ?? []).map((record) => ({ ...record })),
      probe,
    };
  }
}

/** Positions as text, with the value of each bit: "18 (1), 43 (0), …". */
export function describeBits(bloom: BloomModel, key: string): string {
  return bloom
    .positions(key)
    .map((position) => `${position} (${bloom.bits[position]})`)
    .join(', ');
}

export function firstZeroBit(bloom: BloomModel, key: string): number | undefined {
  return bloom.positions(key).find((position) => bloom.bits[position] === 0);
}

/** One table's part of a read: Bloom check, sparse index, one block, binary search. Records steps. */
export function readThroughTable(
  sim: LsmSim,
  recorder: TraceRecorder,
  table: Table,
  key: string,
  snippetId: string,
  lines: { bloom: number; index: number; block: number; search: number },
  maybeNote = '',
): RecordView | undefined {
  const bloom = table.bloomModel;
  const name = shortName(table);
  if (bloom) {
    const positions = bloom.positions(key);
    const zero = firstZeroBit(bloom, key);
    if (zero !== undefined) {
      recorder.record({
        title: `Bloom filter of ${name}: no`,
        narration: `${key} hashes to bits ${describeBits(bloom, key)}. Bit ${zero} is 0, and a key that had been added would have set it, so ${key} is definitely not in ${name}. The table is skipped without touching the disk.`,
        focus: { componentId: table.id, bits: positions, zeroBit: zero },
        io: [{ kind: 'ram-read', componentId: table.id, detail: `Bloom filter, ${positions.length} bits` }],
        snippet: { id: snippetId, line: lines.bloom },
      });
      return undefined;
    }
    recorder.record({
      title: `Bloom filter of ${name}: maybe`,
      narration: `${key} hashes to bits ${positions.join(', ')}, and all ${positions.length} are 1. The filter can only say "maybe", so the table has to be checked on disk.${maybeNote ? ` ${maybeNote}` : ''}`,
      focus: { componentId: table.id, bits: positions },
      io: [{ kind: 'ram-read', componentId: table.id, detail: `Bloom filter, ${positions.length} bits` }],
      snippet: { id: snippetId, line: lines.bloom },
    });
  }

  const blockIndex = locateBlock(table, key);
  const block = table.blocks[blockIndex];
  if (!block) {
    recorder.record({
      title: `Sparse index of ${name}: no block`,
      narration: `${key} sorts before the first key of ${name}, so no block can hold it and the table is skipped.`,
      focus: { componentId: table.id },
      io: [{ kind: 'ram-read', componentId: table.id, detail: 'sparse index' }],
      snippet: { id: snippetId, line: lines.index },
    });
    return undefined;
  }
  const next = table.blocks[blockIndex + 1];
  recorder.record({
    title: `Pick block ${blockIndex + 1} of ${name}`,
    narration: `The sparse index in RAM says block ${blockIndex + 1} starts at ${block.firstKey}${next ? ` and the next one at ${next.firstKey}` : ' and is the last block'}, so ${key} can only be in block ${blockIndex + 1}, at offset ${block.offset}.`,
    focus: { componentId: table.id, blockIndex },
    io: [{ kind: 'ram-read', componentId: table.id, detail: `sparse index: block ${blockIndex + 1} at offset ${block.offset}` }],
    snippet: { id: snippetId, line: lines.index },
  });

  const { probes, found } = binarySearchProbes(block.records, key);
  sim.extraRam = [sim.blockBuffer(table, blockIndex)];
  recorder.record({
    title: 'Read one block',
    narration: `One disk read brings block ${blockIndex + 1} into RAM: ${block.length} bytes, ${block.records.length} entries. No other part of ${name} is read.`,
    focus: { componentId: table.id, blockIndex },
    touched: [table.id, BUFFER],
    io: [{ kind: 'disk-random-read', componentId: table.id, detail: `block ${blockIndex + 1}, offset ${block.offset}, ${block.length} bytes` }],
    snippet: { id: snippetId, line: lines.block },
  });

  const last = probes.at(-1);
  sim.extraRam = [sim.blockBuffer(table, blockIndex, last)];
  const record = found >= 0 ? block.records[found] : undefined;
  recorder.record({
    title: record ? `Found ${key} in the block` : `${key} is not in the block`,
    narration: record
      ? `A binary search over the sorted entries finds ${key} in ${probes.length} ${probes.length === 1 ? 'probe' : 'probes'}: ${record.value.type === 'tombstone' ? 'a tombstone' : record.value.display}.`
      : `A binary search over the sorted entries ends after ${probes.length} probes without a match. ${key} is not in ${name}, so the read moves on.`,
    focus: { componentId: BUFFER, recordIds: last && block.records[last.mid] ? [block.records[last.mid]!.recordId] : [] },
    io: [{ kind: 'ram-read', componentId: BUFFER, detail: `binary search, ${probes.length} probes` }],
    outcome: 'ok',
    snippet: { id: snippetId, line: lines.search },
  });
  return record;
}

/* ------------------------------------------------------------------------------------------------
 * Stage 16 walkthroughs.
 * --------------------------------------------------------------------------------------------- */

export function writePath(): readonly Step[] {
  const sim = LsmSim.atChapter(10, true);
  const recorder = sim.recorder();
  const galaxy = sim.memtable.peek('galaxy');

  recorder.record({
    title: 'A fresh WAL after the last flush',
    narration: `The last flush emptied the WAL: ${sim.wal.label} holds 0 of ${DEMO_CONFIG.walMaxBytes} bytes. Every memtable entry is clean, a cached copy of something already in a table, including galaxy = ${galaxy?.value.display}.`,
    focus: { componentId: MEM, recordIds: galaxy ? [galaxy.recordId] : [] },
    touched: [MEM, sim.wal.id],
    snippet: { id: 'put', line: 1 },
  });

  const item = value(4.3);
  const record = sim.wal.append('galaxy', item);
  recorder.record({
    title: 'Append to the WAL',
    narration: `put galaxy = 4.3 first appends a ${record.bytes}-byte record at offset ${record.offset}: 8 bytes of checksum and length, then the entry. The file is forced to disk (fsync) before anything else happens, so from here on a crash can't lose it.`,
    focus: { componentId: sim.wal.id, recordIds: [record.recordId] },
    io: [{ kind: 'disk-append', componentId: sim.wal.id, detail: `galaxy at offset ${record.offset}, ${record.bytes} bytes, fsync` }],
    snippet: { id: 'put', line: 3 },
  });

  sim.memtable.putDirty('galaxy', item);
  const updated = sim.memtable.peek('galaxy');
  recorder.record({
    title: 'Upsert into the memtable',
    narration: 'galaxy is already in the memtable as a clean cached copy, so no slot is needed: its value becomes 4.3 and it is marked dirty, because the newest value now exists only in the WAL.',
    focus: { componentId: MEM, recordIds: updated ? [updated.recordId] : [] },
    io: [{ kind: 'ram-write', componentId: MEM, detail: 'galaxy = 4.3, dirty' }],
    snippet: { id: 'put', line: 4 },
  });

  recorder.record({
    title: 'Check the limits',
    narration: `The WAL holds ${sim.wal.usedBytes} of ${DEMO_CONFIG.walMaxBytes} bytes and ${sim.memtable.dirtyCount} of ${DEMO_CONFIG.memtableCapacity} memtable slots are dirty. Neither limit is reached, so the put returns: one sequential append and one RAM update.`,
    focus: { componentId: sim.wal.id },
    touched: [sim.wal.id, MEM],
    snippet: { id: 'put', line: 5 },
  });

  const second = value(4.2);
  const kindle = sim.wal.append('kindle', second);
  sim.memtable.putDirty('kindle', second);
  const kindleRow = sim.memtable.peek('kindle');
  recorder.record({
    title: 'The next put does the same',
    narration: `put kindle = 4.2 appends ${kindle.bytes} bytes at offset ${kindle.offset} and turns the cached kindle into a dirty 4.2. The WAL is now at ${sim.wal.usedBytes} bytes, still under the limit.`,
    focus: { componentId: MEM, recordIds: kindleRow ? [kindleRow.recordId] : [] },
    touched: [sim.wal.id, MEM],
    io: [
      { kind: 'disk-append', componentId: sim.wal.id, detail: `kindle at offset ${kindle.offset}, ${kindle.bytes} bytes, fsync` },
      { kind: 'ram-write', componentId: MEM, detail: 'kindle = 4.2, dirty' },
    ],
    snippet: { id: 'put', line: 4 },
  });
  return recorder.steps;
}

/** The state right after the demo's restart: tables from chapter 9, the replayed WAL, a fresh memtable. */
function recovered(): LsmSim {
  const sim = LsmSim.atChapter(10, true, DEMO_CHAPTERS[10]!.length);
  sim.memtable.clear();
  for (const record of sim.wal.records) sim.memtable.putDirty(record.key, record.value);
  return sim;
}

export function readMemtableHit(): readonly Step[] {
  const sim = recovered();
  const recorder = sim.recorder();
  recorder.record({
    title: 'After the restart',
    narration: `Recovery rebuilt the memtable from the WAL: galaxy and kindle, both dirty. ${sim.tables.length} tables sit on disk with their sparse indexes and Bloom filters loaded in RAM.`,
    focus: { componentId: MEM },
    touched: [MEM],
    snippet: { id: 'get', line: 1 },
  });

  const hit = sim.memtable.get('galaxy');
  recorder.record({
    title: 'Check the memtable',
    narration: 'get galaxy looks in the memtable first and finds it. Every write passes through the memtable, so anything there is the newest value, whether dirty or clean.',
    focus: { componentId: MEM, recordIds: hit ? [hit.recordId] : [] },
    io: [{ kind: 'ram-read', componentId: MEM, detail: 'galaxy: hit, dirty' }],
    snippet: { id: 'get', line: 2 },
  });

  recorder.record({
    title: 'Return 4.3',
    narration: `The read returns ${hit?.value.display} without touching a single file. The tables and their Bloom filters are never consulted, even though ${sim.tables.filter((table) => sim.findInTable(table, 'galaxy')).length} of them hold older galaxy values.`,
    focus: { componentId: MEM, recordIds: hit ? [hit.recordId] : [] },
    touched: [MEM],
    snippet: { id: 'get', line: 3 },
  });
  return recorder.steps;
}

export function readThroughTables(): readonly Step[] {
  const sim = recovered();
  const recorder = sim.recorder();
  const key = 'macbook';

  recorder.record({
    title: 'Memtable miss',
    narration: `get ${key} finds nothing in the memtable, which holds only galaxy and kindle after the restart. The read now checks the tables from newest to oldest, because the first match is the newest value.`,
    focus: { componentId: MEM },
    io: [{ kind: 'ram-read', componentId: MEM, detail: `${key}: miss` }],
    snippet: { id: 'get', line: 2 },
  });

  let found: RecordView | undefined;
  for (const table of sim.newestFirst()) {
    found = readThroughTable(sim, recorder, table, key, 'get', { bloom: 6, index: 7, block: 8, search: 9 });
    if (found) break;
    sim.extraRam = [];
  }

  if (found) {
    sim.extraRam = [];
    sim.memtable.putClean(key, found.value);
    const row = sim.memtable.peek(key);
    recorder.record({
      title: 'Cache it as clean',
      narration: `The value ${found.value.display} goes into the memtable as a clean entry: a copy of what is on disk, which can be evicted later at no cost. The next read of ${key} won't touch the disk.`,
      focus: { componentId: MEM, recordIds: row ? [row.recordId] : [] },
      io: [{ kind: 'ram-write', componentId: MEM, detail: `${key} = ${found.value.display}, clean` }],
      snippet: { id: 'get', line: 11 },
    });
  }
  return recorder.steps;
}

export function flushAndCompaction(): readonly Step[] {
  const sim = LsmSim.atChapter(9, true);
  const recorder = sim.recorder();

  recorder.record({
    title: 'A nearly full memtable',
    narration: `${sim.wal.label} holds ${sim.wal.usedBytes} bytes and the memtable has ${sim.memtable.dirtyCount} dirty entries, including the watch tombstone. Two tables are on disk; the compaction trigger is ${DEMO_CONFIG.compactionTrigger}.`,
    focus: { componentId: MEM },
    touched: [MEM, sim.wal.id],
    snippet: { id: 'flush', line: 1 },
  });

  const item = value(4.4);
  const record = sim.wal.append('pixel8', item);
  const { evicted } = sim.memtable.putDirty('pixel8', item);
  recorder.record({
    title: 'put pixel8 = 4.4',
    narration: `The record is appended at offset ${record.offset}, taking the WAL to ${sim.wal.usedBytes} bytes. pixel8 is a new key and the memtable is full, so the least recently used clean entry, ${evicted}, is evicted to make room.`,
    focus: { componentId: sim.wal.id, recordIds: [record.recordId] },
    touched: [sim.wal.id, MEM],
    io: [
      { kind: 'disk-append', componentId: sim.wal.id, detail: `pixel8 at offset ${record.offset}, ${record.bytes} bytes` },
      { kind: 'ram-write', componentId: MEM, detail: `evict ${evicted}, pixel8 = 4.4 dirty` },
    ],
    snippet: { id: 'put', line: 4 },
  });

  const reason = sim.flushReason();
  const table = sim.flushTable();
  sim.extraDisk = [{ ...asComponent(table), status: 'writing' }];
  recorder.record({
    title: 'Flush: write a sorted table',
    narration: `A flush is due because ${reason}. The ${table.blocks.flatMap((block) => block.records).length} dirty entries are written in key order to ${table.label}, packed into ${table.blocks.length} blocks of at most ${DEMO_CONFIG.blockSizeBytes} bytes, followed by the sparse index and a Bloom filter. It goes to a temporary file first.`,
    focus: { componentId: table.id },
    io: [{ kind: 'disk-create', componentId: table.id, detail: `${table.label}.tmp, then fsync` }],
    snippet: { id: 'flush', line: 3 },
  });

  sim.extraDisk = [];
  const oldWal = sim.publishFlush(table);
  sim.extraDisk = [oldWal.view()];
  recorder.record({
    title: 'Publish it and swap the WAL',
    narration: `A rename makes ${table.label} appear all at once. Only then is ${oldWal.label} deleted, because its records are now in the table, and ${sim.wal.label} starts empty. The memtable entries all become clean.`,
    focus: { componentId: table.id },
    touched: [table.id, oldWal.id, sim.wal.id, MEM],
    io: [
      { kind: 'disk-create', componentId: sim.wal.id, detail: sim.wal.label },
      { kind: 'disk-delete', componentId: oldWal.id, detail: oldWal.label },
    ],
    snippet: { id: 'flush', line: 5 },
  });

  sim.extraDisk = [];
  const inputs = sim.compactionInputs();
  if (!inputs) return recorder.steps;
  const [older, newer] = inputs;
  const drop = sim.canDropTombstones(older);
  sim.extraRam = [sim.mergeLanes(older, newer)];
  recorder.record({
    title: 'Three tables: merge the two oldest',
    narration: `The flush made ${sim.tables.length} tables, which reaches the trigger. The compactor merges the two oldest, ${shortName(older)} and ${shortName(newer)}. ${older.label} is the oldest table on disk, so tombstones may be dropped in this merge.`,
    focus: { componentId: MERGE },
    touched: [MERGE, older.id, newer.id],
    snippet: { id: 'compact', line: 3 },
  });

  const { steps, output } = sim.merge(older, newer, drop);
  const done = steps.at(-1);
  if (!done || !output) return recorder.steps;
  sim.extraRam = [sim.mergeLanes(older, newer, LsmSim.advanced(done, tableRecords(older).length, tableRecords(newer).length))];
  const duplicates = steps.filter((step) => step.decision.startsWith('Both')).length;
  recorder.record({
    title: 'Walk both tables with two pointers',
    narration: `Each comparison emits the smaller key; on equal keys the newer entry wins. ${duplicates > 0 ? `The two tables share ${duplicates} keys, so ${done.output.length} entries come out` : `The two tables share no keys, so all ${done.output.length} entries come through`}, in key order.`,
    focus: { componentId: MERGE },
    io: [
      { kind: 'disk-sequential-read', componentId: older.id, detail: `${tableRecords(older).length} entries` },
      { kind: 'disk-sequential-read', componentId: newer.id, detail: `${tableRecords(newer).length} entries` },
    ],
    snippet: { id: 'compact', line: 5 },
  });

  sim.extraRam = [];
  sim.replaceTables(inputs, output);
  sim.extraDisk = [
    { ...asComponent(older), status: 'deleted' },
    { ...asComponent(newer), status: 'deleted' },
  ];
  recorder.record({
    title: 'Write the merged table, delete the inputs',
    narration: `${output.label} holds ${tableRecords(output).length} entries in ${output.blocks.length} blocks, with a new Bloom filter sized for them. Its name covers WALs ${output.minSeq} to ${output.maxSeq}, so it still sorts as older than ${shortName(sim.newestFirst()[0]!)}. Only after it is on disk are the inputs deleted.`,
    focus: { componentId: output.id },
    touched: [output.id, older.id, newer.id],
    io: [
      { kind: 'disk-create', componentId: output.id, detail: `${output.label}, ${output.blocks.reduce((total, block) => total + block.length, 0)} bytes of entries` },
      { kind: 'disk-delete', componentId: older.id, detail: older.label },
      { kind: 'disk-delete', componentId: newer.id, detail: newer.label },
    ],
    snippet: { id: 'compact', line: 7 },
  });

  sim.extraDisk = [];
  recorder.record({
    title: 'Back below the trigger',
    narration: `Two tables remain, below the trigger of ${DEMO_CONFIG.compactionTrigger}, so compaction stops. The write that started all this only ever waited for its own WAL append.`,
    touched: sim.tables.map((t) => t.id),
    focus: { componentId: output.id },
    snippet: { id: 'compact', line: 2 },
  });
  return recorder.steps;
}

export function crashAndRecovery(): readonly Step[] {
  const sim = LsmSim.atChapter(10, true, DEMO_CHAPTERS[10]!.length);
  const recorder = sim.recorder();
  const walId = sim.wal.id;

  recorder.record({
    title: 'Two acknowledged writes',
    narration: `galaxy = 4.3 and kindle = 4.2 are in ${sim.wal.label} (${sim.wal.usedBytes} bytes) and dirty in the memtable. A third write is in progress when the power fails.`,
    focus: { componentId: walId },
    touched: [walId, MEM],
    snippet: { id: 'recover', line: 1 },
  });

  sim.ramLost = true;
  sim.wal.tornBytes = TORN_BYTES;
  for (const table of sim.tables) sim.unloaded.add(table.id);
  recorder.record({
    title: 'Crash in the middle of an append',
    narration: `RAM is gone: the memtable, sparse indexes and Bloom filters. Only ${TORN_BYTES} bytes of the third record reached the WAL. That write was never acknowledged, but its torn bytes are now at the end of the file.`,
    outcome: 'problem',
    focus: { componentId: walId },
    touched: [walId],
    snippet: { id: 'recover', line: 1 },
  });

  recorder.record({
    title: 'Delete unfinished temporary files',
    narration: 'On restart, recovery first deletes every *.tmp file: a flush or merge that never reached its rename, whose source data still exists. There are none here, because the crash did not interrupt a flush.',
    touched: sim.tables.map((t) => t.id),
    io: [{ kind: 'disk-sequential-read', componentId: walId, detail: 'list the data directory' }],
    snippet: { id: 'recover', line: 2 },
  });

  const [oldest, newest] = [...sim.tables].sort((left, right) => left.maxSeq - right.maxSeq);
  recorder.record({
    title: 'Drop tables inside another range',
    narration: `A table whose range lies inside another table's range is a leftover input of a finished merge. ${shortName(oldest!)} covers ${oldest!.minSeq} to ${oldest!.maxSeq} and ${shortName(newest!)} covers ${newest!.minSeq}, so neither contains the other and both stay.`,
    focus: { componentId: oldest!.id },
    touched: sim.tables.map((t) => t.id),
    snippet: { id: 'recover', line: 3 },
  });

  sim.unloaded.clear();
  sim.ramLost = false;
  sim.memtable.clear();
  recorder.record({
    title: 'Open the tables',
    narration: 'Each table\'s sparse index and Bloom filter are read from its file into RAM, once. The memtable starts empty.',
    touched: [...sim.tables.map((t) => t.id), MEM],
    focus: { componentId: newest!.id },
    io: sim.tables.map((table) => ({ kind: 'disk-sequential-read' as const, componentId: table.id, detail: 'sparse index and Bloom filter' })),
    snippet: { id: 'recover', line: 4 },
  });

  const highest = Math.max(...sim.tables.map((table) => table.maxSeq));
  recorder.record({
    title: 'Keep only WALs not yet flushed',
    narration: `A WAL whose number is already covered by a table was flushed before the crash and is deleted. The highest table sequence is ${highest} and this is ${sim.wal.label}, so it must be replayed.`,
    focus: { componentId: walId },
    snippet: { id: 'recover', line: 5 },
  });

  const replayed: string[] = [];
  for (const record of sim.wal.records) {
    sim.memtable.putDirty(record.key, record.value);
    replayed.push(record.recordId);
    recorder.record({
      title: `Replay ${record.key}`,
      narration: `The record at offset ${record.offset} is complete and its CRC-32 checksum matches its ${record.bytes - 8} payload bytes, so ${record.key} = ${record.value.display} goes back into the memtable as dirty.`,
      focus: { componentId: walId, recordIds: [record.recordId] },
      touched: [walId, MEM],
      io: [
        { kind: 'disk-sequential-read', componentId: walId, detail: `${record.key} at offset ${record.offset}, ${record.bytes} bytes` },
        { kind: 'ram-write', componentId: MEM, detail: `${record.key} = ${record.value.display}, dirty` },
      ],
      snippet: { id: 'recover', line: 12 },
    });
  }

  recorder.record({
    title: 'The last record fails the check',
    narration: `At offset ${sim.wal.usedBytes} only ${TORN_BYTES} bytes remain, fewer than the 8-byte header of checksum and length, so the record can't be complete. A record with all its bytes but damaged contents would fail the CRC-32 comparison instead. Either way it is a torn write, and replay stops here.`,
    outcome: 'problem',
    focus: { componentId: walId },
    io: [{ kind: 'disk-sequential-read', componentId: walId, detail: `${TORN_BYTES} bytes at offset ${sim.wal.usedBytes}` }],
    snippet: { id: 'recover', line: 7 },
  });

  sim.wal.tornBytes = 0;
  recorder.record({
    title: 'Truncate and warn',
    narration: `The WAL is cut back to ${sim.wal.usedBytes} bytes, dropping the ${TORN_BYTES} torn bytes, and a warning is logged. The torn write was never acknowledged, so nothing that was promised is lost.`,
    focus: { componentId: walId },
    io: [{ kind: 'disk-overwrite', componentId: walId, detail: `truncate to ${sim.wal.usedBytes} bytes, ${TORN_BYTES} dropped` }],
    snippet: { id: 'recover', line: 8 },
  });

  recorder.record({
    title: 'Open for writes again',
    narration: `The memtable holds only the ${sim.memtable.dirtyCount} dirty entries replayed from the WAL; the cache of clean entries refills as keys are read. New writes continue appending to ${sim.wal.label} at offset ${sim.wal.usedBytes}.`,
    focus: { componentId: MEM, recordIds: replayed.length ? sim.memtable.rows().map((row) => row.recordId) : [] },
    touched: [MEM, walId],
    snippet: { id: 'recover', line: 14 },
  });
  return recorder.steps;
}
