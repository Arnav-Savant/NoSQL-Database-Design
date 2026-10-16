import { BASE_WRITES, DEMO_CONFIG, UPDATES } from '@/content/dataset';
import type { DiskComponent, MachineState, OffsetRow, PositionedRecord, RamComponent, RecordView, Value } from '../model';
import { LogFileModel } from '../structures/logFile';
import { MemtableModel } from '../structures/memtable';
import { asComponent, buildSSTable, tableRecords } from '../structures/sstable';
import { TraceRecorder, type Step } from '../trace';
import { entryBytes, type RawValue, value, walRecordBytes } from '../values';

export type SSTable = Extract<DiskComponent, { kind: 'sstable' }>;
type Write = readonly [string, RawValue];

const MEMTABLE = 'memtable';
const MAP = 'offset-map';

/** The engine demo's writes, WAL by WAL. The delete of watch is left out: tombstones arrive in stage 14. */
export const FIRST_WAL: readonly Write[] = [BASE_WRITES[0]!, BASE_WRITES[1]!, BASE_WRITES[2]!, UPDATES[0]!, BASE_WRITES[3]!];
/** The two reads the demo makes between the first and second WAL; they change the LRU order. */
export const CACHE_READS: readonly string[] = ['macbook', 'iphone11'];
export const SECOND_WAL: readonly Write[] = BASE_WRITES.slice(4, 9);
export const THIRD_WAL: readonly Write[] = [...UPDATES.slice(1), ['pixel8', 4.4]];
export const FOURTH_WAL: readonly Write[] = [
  ['kindle', 'Paperwhite'],
  ['galaxy', false],
  ['iphone11', 4.7],
  ['airpods', 4.6],
  ['ipad', 4.5],
];

const pad = (sequence: number) => String(sequence).padStart(6, '0');

export interface TableLayout {
  showBlocks: boolean;
  showSparseIndex: boolean;
}

/**
 * A model of the real engine's write path with the demo configuration: WAL records sized like the
 * engine's, a flush when the WAL reaches its limit or the memtable is all dirty, and SSTables packed
 * into blocks by the engine's own rule.
 */
export class EngineSim {
  readonly memtable = new MemtableModel(DEMO_CONFIG.memtableCapacity, MEMTABLE, 'Memtable');
  wal: LogFileModel;
  retiredWals: LogFileModel[] = [];
  /** Oldest first. */
  tables: SSTable[] = [];
  readonly offsets = new Map<string, { table: string; offset: number }>();

  constructor(readonly layout: TableLayout = { showBlocks: false, showSparseIndex: false }) {
    this.wal = EngineSim.openWal(1);
  }

  static openWal(sequence: number): LogFileModel {
    return new LogFileModel({
      id: `wal-${sequence}`,
      label: `wal-${pad(sequence)}.log`,
      sizeOf: walRecordBytes,
      capacityBytes: DEMO_CONFIG.walMaxBytes,
    });
  }

  get walSequence(): number {
    return Number(this.wal.id.slice('wal-'.length));
  }

  put(key: string, raw: RawValue): { record: PositionedRecord; evicted: string | null; item: Value; isNewKey: boolean } {
    const item = value(raw);
    const record = this.wal.append(key, item);
    this.wal.markOlderVersionsStale(key);
    const { evicted, isNewKey } = this.memtable.putDirty(key, item);
    return { record, evicted, item, isNewKey };
  }

  flushDue(): boolean {
    return this.wal.usedBytes >= DEMO_CONFIG.walMaxBytes || this.memtable.isSaturatedWithDirty();
  }

  buildTable(minSeq: number, maxSeq: number, records: readonly RecordView[] = this.memtable.dirtyRecordsSorted()): SSTable {
    return asComponent(
      buildSSTable({
        minSeq,
        maxSeq,
        records,
        blockSizeBytes: DEMO_CONFIG.blockSizeBytes,
        sizeOf: entryBytes,
        showBlocks: this.layout.showBlocks,
        showSparseIndex: this.layout.showSparseIndex,
      }),
    );
  }

  /** Flush phase 3: the new table appears, still being written. */
  startTable(): SSTable {
    const sequence = this.walSequence;
    const table = { ...this.buildTable(sequence, sequence), status: 'writing' as const };
    this.tables.push(table);
    return table;
  }

  /** Flush phases 5 and 6, first half: open the next WAL and retire the full one. */
  rotateWal(): { old: LogFileModel; next: LogFileModel } {
    const old = this.wal;
    old.status = 'closed';
    this.retiredWals.push(old);
    this.wal = EngineSim.openWal(this.walSequence + 1);
    return { old, next: this.wal };
  }

  indexTable(table: SSTable): void {
    for (const record of tableRecords(table)) this.offsets.set(record.key, { table: table.id, offset: (record as PositionedRecord).offset });
  }

  dropDeleted(): void {
    this.retiredWals = this.retiredWals.filter((wal) => wal.status !== 'deleted');
    this.tables = this.tables.filter((table) => table.status !== 'deleted');
  }

  /** The whole flush in one go, exactly as the engine does it. */
  flush(keepDeletedWal = false): SSTable {
    const table = this.startTable();
    table.status = 'live';
    this.memtable.markAllClean();
    const { old } = this.rotateWal();
    old.status = 'deleted';
    this.indexTable(table);
    if (!keepDeletedWal) this.dropDeleted();
    return table;
  }

  run(writes: readonly Write[]): void {
    for (const [key, raw] of writes) {
      this.put(key, raw);
      if (this.flushDue()) this.flush();
    }
  }

  read(keys: readonly string[]): void {
    for (const key of keys) this.memtable.get(key);
  }

  table(id: string): SSTable | undefined {
    return this.tables.find((table) => table.id === id);
  }

  tablesNewestFirst(): SSTable[] {
    return [...this.tables].reverse().sort((left, right) => right.maxSeq - left.maxSeq);
  }

  offsetMapView(): RamComponent {
    const rows = [...this.offsets.entries()]
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([key, location]): OffsetRow => ({ key, target: `${location.table} @ ${location.offset}` }));
    return { kind: 'offset-map', id: MAP, label: 'Offset map', rows };
  }

  diskView(showWal = true): DiskComponent[] {
    return [...(showWal ? [this.wal.view(), ...this.retiredWals.map((wal) => wal.view())] : []), ...this.tablesNewestFirst()];
  }
}

/** The state after the demo's first flush and its two cache reads. */
export function afterFirstFlush(layout?: TableLayout): EngineSim {
  const sim = new EngineSim(layout);
  sim.run(FIRST_WAL);
  sim.read(CACHE_READS);
  return sim;
}

export function afterSecondFlush(layout?: TableLayout): EngineSim {
  const sim = afterFirstFlush(layout);
  sim.run(SECOND_WAL);
  return sim;
}

export function afterThirdFlush(layout?: TableLayout): EngineSim {
  const sim = afterSecondFlush(layout);
  sim.run(THIRD_WAL);
  return sim;
}

export function afterFourthFlush(layout?: TableLayout): EngineSim {
  const sim = afterThirdFlush(layout);
  sim.run(FOURTH_WAL);
  return sim;
}

function recorderFor(sim: EngineSim): TraceRecorder {
  return new TraceRecorder((): MachineState => ({ ram: [sim.memtable.view(), sim.offsetMapView()], disk: sim.diskView() }));
}

const memId = (sim: EngineSim, key: string) => sim.memtable.peek(key)?.recordId ?? '';
const sstRecordId = (table: SSTable, key: string) => `${table.id}:${key}`;

export function flushFirstWal(): readonly Step[] {
  const sim = new EngineSim();
  const recorder = recorderFor(sim);
  for (const [key, raw] of FIRST_WAL.slice(0, -1)) sim.put(key, raw);

  recorder.record({
    title: 'Four writes in the WAL',
    narration: `wal-000001.log holds ${sim.wal.records.length} records, ${sim.wal.usedBytes} of its ${DEMO_CONFIG.walMaxBytes} bytes. Each record carries a checksum and a length, which is why iphone11 = 4.8 costs ${walRecordBytes('iphone11', value(4.8))} bytes. The memtable holds only the newest macbook, and every entry is dirty: its value exists only in the WAL so far.`,
    focus: { componentId: sim.wal.id },
    touched: [sim.wal.id, MEMTABLE],
    snippet: { id: 'put', line: 1 },
  });

  const [ipadKey, ipadRaw] = FIRST_WAL[FIRST_WAL.length - 1]!;
  const { record } = sim.put(ipadKey, ipadRaw);
  recorder.record({
    title: 'Append ipad, reaching the limit',
    narration: `ipad = 4.6 adds ${record.bytes} bytes and the WAL reaches ${sim.wal.usedBytes} bytes, past its ${DEMO_CONFIG.walMaxBytes}-byte limit. The write is already durable; now the store flushes.`,
    focus: { componentId: sim.wal.id, recordIds: [record.recordId] },
    touched: [sim.wal.id, MEMTABLE],
    io: [
      { kind: 'disk-append', componentId: sim.wal.id, detail: `ipad, ${record.bytes} bytes, WAL now ${sim.wal.usedBytes} bytes` },
      { kind: 'ram-write', componentId: MEMTABLE, detail: 'ipad = 4.6, dirty' },
    ],
    snippet: { id: 'put', line: 4 },
  });

  const dirty = sim.memtable.dirtyRecordsSorted();
  recorder.record({
    title: 'Collect the dirty entries',
    narration: `The flush takes the ${dirty.length} dirty entries from the memtable. The WAL has 5 records but only 4 keys: the memtable already replaced macbook = 4.9 with "Apple".`,
    focus: { componentId: MEMTABLE, recordIds: dirty.map((row) => row.recordId) },
    io: [{ kind: 'ram-read', componentId: MEMTABLE, detail: `${dirty.length} dirty entries` }],
    snippet: { id: 'flush', line: 2 },
  });

  recorder.record({
    title: 'Sort them by key',
    narration: `Keys are compared byte by byte. ipad and iphone11 share "ip", then "a" (0x61) is smaller than "h" (0x68), so ipad comes first: ${dirty.map((row) => row.key).join(', ')}.`,
    focus: { componentId: MEMTABLE, recordIds: [memId(sim, 'ipad'), memId(sim, 'iphone11')] },
    snippet: { id: 'flush', line: 3 },
  });

  const table = sim.startTable();
  recorder.record({
    title: 'Write the SSTable',
    narration: `The sorted entries are written to ${table.label}, a Sorted String Table: one entry per key, sorted, never modified again. The name says it covers WAL sequence 1 to 1. It is written under a temporary name first.`,
    focus: { componentId: table.id },
    io: [{ kind: 'disk-create', componentId: table.id, detail: `${dirty.length} entries, written sequentially` }],
    snippet: { id: 'flush', line: 4 },
  });

  table.status = 'live';
  recorder.record({
    title: 'Sync and rename',
    narration: 'Once the bytes are synced to disk, the file is renamed to its real name. A crash can leave a temporary file behind, but never a half-written table under a real name.',
    focus: { componentId: table.id },
    snippet: { id: 'flush', line: 4 },
  });

  sim.memtable.markAllClean();
  recorder.record({
    title: 'Mark the entries clean',
    narration: 'The four entries are now saved in the table, so they become clean. They stay in RAM as a cache: a read of any of them still needs no disk access.',
    focus: { componentId: MEMTABLE, recordIds: sim.memtable.rows().map((row) => row.recordId) },
    io: [{ kind: 'ram-write', componentId: MEMTABLE, detail: '4 entries dirty to clean' }],
    snippet: { id: 'flush', line: 5 },
  });

  const { old, next } = sim.rotateWal();
  recorder.record({
    title: 'Open wal-000002.log',
    narration: `New writes go to ${next.label}, which starts empty. ${old.label} is closed and takes no more writes.`,
    focus: { componentId: next.id },
    touched: [next.id, old.id],
    io: [{ kind: 'disk-create', componentId: next.id, detail: 'new active WAL' }],
    snippet: { id: 'flush', line: 6 },
  });

  old.status = 'deleted';
  const stale = old.records.find((entry) => entry.stale);
  recorder.record({
    title: 'Delete wal-000001.log',
    narration: 'Everything the old WAL protected is now in the SSTable, so it is deleted. The stale macbook = 4.9 disappears with it: it never reached the table.',
    focus: { componentId: old.id, recordIds: stale ? [stale.recordId] : [] },
    io: [{ kind: 'disk-delete', componentId: old.id, detail: `${old.usedBytes} bytes freed` }],
    snippet: { id: 'flush', line: 7 },
  });

  sim.dropDeleted();
  sim.indexTable(table);
  recorder.record({
    title: 'Update the offset map',
    narration: `The offset map learns where each key sits inside the new table, for example iphone12 → ${table.id} @ ${sim.offsets.get('iphone12')?.offset}. A read that misses the memtable can still go straight to one entry on disk.`,
    focus: { componentId: MAP },
    io: [{ kind: 'ram-write', componentId: MAP, detail: `${dirty.length} keys → ${table.id}` }],
    snippet: { id: 'flush', line: 8 },
  });
  return recorder.steps;
}

export function evictionSkipsDirty(): readonly Step[] {
  const sim = new EngineSim();
  sim.run(FIRST_WAL);
  const recorder = recorderFor(sim);

  for (const key of CACHE_READS) {
    const hit = sim.memtable.get(key);
    recorder.record({
      title: `Read ${key} from RAM`,
      narration:
        key === CACHE_READS[0]
          ? `macbook is a clean entry, so the read is answered from memory: ${hit?.value.display}. A clean entry can't be out of date, because every write replaces the memtable entry first. The read also makes macbook the most recently used key.`
          : `Another memtable hit. The LRU (least recently used) order, oldest first, is now ${sim.memtable.evictionOrder().join(', ')}.`,
      focus: { componentId: MEMTABLE, recordIds: [memId(sim, key)] },
      io: [{ kind: 'ram-read', componentId: MEMTABLE, detail: `${key}, clean hit` }],
      snippet: { id: 'get', line: 3 },
    });
  }

  for (const [key, raw] of SECOND_WAL) {
    const order = sim.memtable.evictionOrder();
    const dirtyBefore = sim.memtable.dirtyRecordsSorted().map((row) => row.key);
    const { record, evicted, item } = sim.put(key, raw);
    const full = sim.memtable.size === sim.memtable.capacity;
    let narration: string;
    if (evicted) {
      const skipped = dirtyBefore.length > 0 ? `${dirtyBefore.join(', ')} ${dirtyBefore.length === 1 ? 'is dirty, so it is never a candidate' : 'are dirty, so they are never candidates'}. ` : '';
      narration = `${key} is new and the memtable is full. ${skipped}Among the clean entries (${order.join(', ')}), ${evicted} is least recently used, so it is evicted. Nothing is lost: ${evicted} is still in ${sim.offsets.get(evicted)?.table ?? 'a table'}.`;
    } else {
      narration = `${key} = ${item.display} costs ${record.bytes} bytes in the WAL (${sim.wal.usedBytes} so far) and is stored dirty.${full ? ' The memtable is now full: all 6 slots are used.' : ` ${sim.memtable.size} of 6 slots are used.`}`;
    }
    const due = sim.flushDue();
    if (due) narration += ` The WAL is at ${sim.wal.usedBytes} bytes, past the limit.`;
    recorder.record({
      title: evicted ? `Put ${key}, evict ${evicted}` : `Put ${key}`,
      narration,
      focus: { componentId: MEMTABLE, recordIds: [memId(sim, key)] },
      touched: [sim.wal.id, MEMTABLE],
      io: [
        { kind: 'disk-append', componentId: sim.wal.id, detail: `${key}, ${record.bytes} bytes` },
        ...(evicted ? [{ kind: 'ram-write' as const, componentId: MEMTABLE, detail: `evict clean ${evicted}` }] : []),
        { kind: 'ram-write', componentId: MEMTABLE, detail: `${key} = ${item.display}, dirty` },
      ],
      snippet: evicted ? { id: 'evict', line: 4 } : { id: 'put', line: 3 },
    });
  }

  const dirtyCount = sim.memtable.dirtyCount;
  const oldWal = sim.wal;
  const table = sim.flush(true);
  recorder.record({
    title: 'Flush the second WAL',
    narration: `The ${dirtyCount} dirty entries become ${table.label}. iphone11, the one clean survivor, is not written again: it is already in sst-000001-000001. All 6 entries are clean now, and ${oldWal.label} is gone.`,
    focus: { componentId: table.id },
    touched: [table.id, MEMTABLE, MAP, sim.wal.id],
    io: [
      { kind: 'disk-create', componentId: table.id, detail: `${dirtyCount} entries` },
      { kind: 'disk-delete', componentId: oldWal.id, detail: oldWal.label },
      { kind: 'ram-write', componentId: MAP, detail: `${dirtyCount} keys → ${table.id}` },
    ],
    snippet: { id: 'put', line: 5 },
  });
  return recorder.steps;
}

export function readFillsCache(): readonly Step[] {
  const sim = afterSecondFlush();
  const recorder = recorderFor(sim);
  const key = 'iphone12';

  recorder.record({
    title: 'Memtable miss',
    narration: `iphone12 was evicted earlier, so the memtable doesn't have it. The memtable is checked first because anything in it is the newest value.`,
    focus: { componentId: MEMTABLE },
    io: [{ kind: 'ram-read', componentId: MEMTABLE, detail: `${key}: miss` }],
    snippet: { id: 'get', line: 2 },
  });

  const location = sim.offsets.get(key)!;
  recorder.record({
    title: 'Ask the offset map',
    narration: `The offset map says ${key} → ${location.table} @ ${location.offset}: which table, and where inside it.`,
    focus: { componentId: MAP },
    io: [{ kind: 'ram-read', componentId: MAP, detail: `${key} → ${location.table} @ ${location.offset}` }],
    snippet: { id: 'get', line: 4 },
  });

  const table = sim.table(location.table)!;
  const entry = tableRecords(table).find((row) => row.key === key) as PositionedRecord;
  recorder.record({
    title: 'Read one entry from disk',
    narration: `One random read at offset ${entry.offset} returns ${entry.bytes} bytes: ${key} = ${entry.value.display}.`,
    focus: { componentId: table.id, recordIds: [sstRecordId(table, key)] },
    io: [{ kind: 'disk-random-read', componentId: table.id, detail: `offset ${entry.offset}, ${entry.bytes} bytes` }],
    snippet: { id: 'get', line: 6 },
  });

  const order = sim.memtable.evictionOrder();
  const { evicted } = sim.memtable.putClean(key, entry.value);
  recorder.record({
    title: `Cache it, evict ${evicted}`,
    narration: `The value is cached as a clean entry. The memtable is full, so LRU drops the least recently used clean entry: ${order[0]} (order: ${order.join(', ')}). ${evicted} is still in ${sim.offsets.get(evicted ?? '')?.table}.`,
    focus: { componentId: MEMTABLE, recordIds: [memId(sim, key)] },
    io: [
      { kind: 'ram-write', componentId: MEMTABLE, detail: `evict clean ${evicted}` },
      { kind: 'ram-write', componentId: MEMTABLE, detail: `${key} = ${entry.value.display}, clean` },
    ],
    snippet: { id: 'get', line: 7 },
  });

  sim.memtable.get(key);
  recorder.record({
    title: 'The next read is a hit',
    narration: 'Reading iphone12 again finds it in RAM with no disk access. Frequently read keys stay cached, rarely read ones drift to the end of the LRU order and make room.',
    focus: { componentId: MEMTABLE, recordIds: [memId(sim, key)] },
    io: [{ kind: 'ram-read', componentId: MEMTABLE, detail: `${key}, clean hit` }],
    snippet: { id: 'get', line: 3 },
  });
  return recorder.steps;
}

export function duplicatesAcrossTables(): readonly Step[] {
  const sim = afterSecondFlush();
  const recorder = recorderFor(sim);
  const first = sim.table('sst-1-1')!;

  recorder.record({
    title: 'Two tables, no overlap yet',
    narration: `${first.label} and sst-000002-000002.sst hold different keys. Each table is duplicate-free by construction: it comes from the memtable, which keeps one entry per key.`,
    focus: { componentId: first.id },
    touched: [first.id, 'sst-2-2'],
    snippet: { id: 'flush', line: 3 },
  });

  const [updateKey, updateRaw] = THIRD_WAL[0]!;
  const { record, evicted, item } = sim.put(updateKey, updateRaw);
  recorder.record({
    title: `Update ${updateKey}`,
    narration: `${updateKey} = ${item.display} is appended (${record.bytes} bytes) and stored dirty${evicted ? `, evicting clean ${evicted}` : ''}. ${first.label} still says 4.7, but the memtable is checked first, so reads already see ${item.display}.`,
    focus: { componentId: MEMTABLE, recordIds: [memId(sim, updateKey)] },
    touched: [sim.wal.id, MEMTABLE],
    io: [
      { kind: 'disk-append', componentId: sim.wal.id, detail: `${updateKey}, ${record.bytes} bytes` },
      { kind: 'ram-write', componentId: MEMTABLE, detail: `${updateKey} = ${item.display}, dirty` },
    ],
    snippet: { id: 'put', line: 3 },
  });

  const middle = THIRD_WAL.slice(1, -1);
  const evictions: string[] = [];
  for (const [key, raw] of middle) {
    const result = sim.put(key, raw);
    if (result.evicted) evictions.push(result.evicted);
  }
  recorder.record({
    title: 'Three more updates',
    narration: `${middle.map(([key, raw]) => `${key} = ${value(raw).display}`).join(', ')} follow. The WAL is at ${sim.wal.usedBytes} bytes. LRU evicted the clean ${evictions.join(' and ')} to make room; the dirty entries stay.`,
    focus: { componentId: MEMTABLE, recordIds: middle.map(([key]) => memId(sim, key)) },
    touched: [sim.wal.id, MEMTABLE],
    io: middle.map(([key, raw]) => ({ kind: 'disk-append' as const, componentId: sim.wal.id, detail: `${key}, ${walRecordBytes(key, value(raw))} bytes` })),
    snippet: { id: 'put', line: 2 },
  });

  const [lastKey, lastRaw] = THIRD_WAL[THIRD_WAL.length - 1]!;
  const last = sim.put(lastKey, lastRaw);
  const dirtyCount = sim.memtable.dirtyCount;
  const oldWal = sim.wal;
  const third = sim.flush(true);
  recorder.record({
    title: 'Flush the third WAL',
    narration: `${lastKey} = ${last.item.display} brings the WAL to ${oldWal.usedBytes} bytes, so the ${dirtyCount} dirty entries are flushed to ${third.label}.`,
    focus: { componentId: third.id },
    touched: [third.id, MEMTABLE, MAP, sim.wal.id],
    io: [
      { kind: 'disk-append', componentId: oldWal.id, detail: `${lastKey}, ${last.record.bytes} bytes` },
      { kind: 'disk-create', componentId: third.id, detail: `${dirtyCount} entries` },
      { kind: 'disk-delete', componentId: oldWal.id, detail: oldWal.label },
    ],
    snippet: { id: 'flush', line: 4 },
  });

  sim.dropDeleted();
  recorder.record({
    title: 'iphone12 lives in two tables',
    narration: `${first.label} still holds iphone12 = 4.7. Tables are immutable, so the old entry can't be removed or overwritten.`,
    focus: { componentId: first.id, recordIds: [sstRecordId(first, 'iphone12')] },
    snippet: { id: 'flush', line: 4 },
  });

  const location = sim.offsets.get('iphone12')!;
  recorder.record({
    title: 'The newer table holds the truth',
    narration: `${third.label} holds iphone12 = 4.9, and the offset map now points there (${location.table} @ ${location.offset}). The same goes for ipad and macbook, which also appear in both tables.`,
    focus: { componentId: third.id, recordIds: [sstRecordId(third, 'iphone12')] },
    touched: [third.id, MAP],
    snippet: { id: 'flush', line: 8 },
  });

  const entries = sim.tables.reduce((total, table) => total + tableRecords(table).length, 0);
  const keys = new Set(sim.tables.flatMap((table) => tableRecords(table).map((row) => row.key))).size;
  recorder.record({
    title: 'Duplicates pile up',
    narration: `The three tables hold ${entries} entries for only ${keys} distinct keys. Every flush adds a table, so the waste and the number of files keep growing.`,
    outcome: 'problem',
    focus: { componentId: first.id, recordIds: ['ipad', 'iphone12', 'macbook'].map((key) => sstRecordId(first, key)) },
    touched: sim.tables.map((table) => table.id),
    snippet: { id: 'flush', line: 4 },
  });
  return recorder.steps;
}
