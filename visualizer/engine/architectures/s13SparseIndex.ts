import { DEMO_CONFIG } from '@/content/dataset';
import type { MachineState, RamComponent } from '../model';
import { compareKeys } from '../structures/keyOrder';
import { binarySearchProbes, locateBlock } from '../structures/sstable';
import { TraceRecorder, type Step } from '../trace';
import type { SSTable } from './s10SSTableFlush';
import { afterFirstCompaction } from './s11MergeCompaction';

type Buffer = Extract<RamComponent, { kind: 'block-buffer' }>;

const MEMTABLE = 'memtable';
const BUFFER = 'block-buffer';

/** sst-1-2 and sst-3-3 with their blocks and sparse indexes, and an empty memtable. */
function setup() {
  const sim = afterFirstCompaction({ showBlocks: true, showSparseIndex: true });
  sim.memtable.clear();
  let buffer: Buffer | null = null;
  const recorder = new TraceRecorder((): MachineState => ({ ram: [sim.memtable.view(), ...(buffer ? [buffer] : [])], disk: sim.diskView(false) }));
  const setBuffer = (next: Buffer | null) => {
    buffer = next;
  };
  return { sim, recorder, setBuffer };
}

function indexText(table: SSTable): string {
  return table.blocks.map((block) => `${block.firstKey} @${block.offset}`).join(', ');
}

/** Sparse-index lookup, one block read and an in-memory binary search, one step each. Returns the value found. */
function findInTable(recorder: TraceRecorder, setBuffer: (buffer: Buffer | null) => void, table: SSTable, key: string): { found: boolean; reads: number } {
  setBuffer(null);
  const blockIndex = locateBlock(table, key);
  if (blockIndex === -1) {
    recorder.record({
      title: `Skip ${table.id} without reading`,
      narration: `${table.id}’s sparse index is ${indexText(table)}. ${key} sorts before ${table.blocks[0]?.firstKey}, the first key of the first block, so it can’t be in this table. No disk read at all.`,
      focus: { componentId: table.id },
      io: [{ kind: 'ram-read', componentId: table.id, detail: `sparse index: ${key} is before every block` }],
      snippet: { id: 'find', line: 3 },
    });
    return { found: false, reads: 0 };
  }

  const block = table.blocks[blockIndex]!;
  const next = table.blocks[blockIndex + 1];
  recorder.record({
    title: `Pick block ${blockIndex + 1} of ${table.id}`,
    narration: `${table.id}’s sparse index, kept in RAM, lists each block’s first key and offset: ${indexText(table)}. The last first key that is ≤ ${key} is ${block.firstKey}${next ? ` (${next.firstKey} is already too big)` : ', in the last block'}, so ${key} can only be in block ${blockIndex + 1}.`,
    focus: { componentId: table.id, blockIndex },
    io: [{ kind: 'ram-read', componentId: table.id, detail: `sparse index: ${key} → block ${blockIndex + 1}` }],
    snippet: { id: 'find', line: 2 },
  });

  const records = block.records;
  setBuffer({ kind: 'block-buffer', id: BUFFER, label: `Block ${blockIndex + 1} of ${table.id}`, records });
  recorder.record({
    title: `Read block ${blockIndex + 1}`,
    narration: `One random read fetches bytes ${block.offset} to ${block.offset + block.length - 1}: the whole ${block.length}-byte block, ${records.length} ${records.length === 1 ? 'entry' : 'entries'}. Blocks are at most ${DEMO_CONFIG.blockSizeBytes} bytes here; real systems use about 4 KiB.`,
    focus: { componentId: table.id, blockIndex },
    touched: [table.id, BUFFER],
    io: [{ kind: 'disk-random-read', componentId: table.id, detail: `block ${blockIndex + 1}, offset ${block.offset}, ${block.length} bytes` }],
    snippet: { id: 'find', line: 4 },
  });

  const { probes, found } = binarySearchProbes(records, key);
  probes.forEach((probe, index) => {
    const entry = records[probe.mid]!;
    const order = compareKeys(key, entry.key);
    setBuffer({ kind: 'block-buffer', id: BUFFER, label: `Block ${blockIndex + 1} of ${table.id}`, records, probe });
    const last = index === probes.length - 1;
    let narration = `mid=${probe.mid} is ${entry.key}, already in RAM, so this costs no disk access.`;
    let line: number;
    if (order === 0) {
      narration += ` It matches: ${entry.value.display}.`;
      line = 5;
    } else if (order > 0) {
      narration += ` ${key} sorts after it, so low=${probe.mid + 1}.`;
      line = 6;
    } else {
      narration += ` ${key} sorts before it, so high=${probe.mid - 1}.`;
      line = 7;
    }
    if (last && found === -1) narration += ` low has passed high: ${key} is not in this block, so not in ${table.id}.`;
    recorder.record({
      title: order === 0 ? `Found in block ${blockIndex + 1}` : last && found === -1 ? `Not in ${table.id}` : `Probe ${entry.key} in RAM`,
      narration,
      focus: { componentId: BUFFER },
      io: [{ kind: 'ram-read', componentId: BUFFER, detail: `compare with ${entry.key}` }],
      snippet: { id: 'search', line },
    });
  });
  return { found: found !== -1, reads: 1 };
}

function recordMiss(recorder: TraceRecorder, key: string): void {
  recorder.record({
    title: 'Memtable miss',
    narration: `The memtable is empty, so ${key} must come from the tables, newest first. Each table now carries a sparse index: one entry per block, not per key.`,
    focus: { componentId: MEMTABLE },
    io: [{ kind: 'ram-read', componentId: MEMTABLE, detail: `${key}: miss` }],
    snippet: { id: 'get', line: 2 },
  });
}

export function readThroughSparseIndex(): readonly Step[] {
  const { sim, recorder, setBuffer } = setup();
  const key = 'iphone11';
  recordMiss(recorder, key);

  let reads = 0;
  for (const table of sim.tablesNewestFirst()) {
    const result = findInTable(recorder, setBuffer, table, key);
    reads += result.reads;
    if (result.found) break;
  }

  setBuffer(null);
  const entry = sim.table('sst-1-2')!.blocks.flatMap((block) => block.records).find((record) => record.key === key)!;
  sim.memtable.putClean(key, entry.value);
  recorder.record({
    title: 'Cache and return',
    narration: `${key} = ${entry.value.display} is cached and returned after ${reads} block reads, one per table. In stage 12 the same read took 7 random reads.`,
    focus: { componentId: MEMTABLE, recordIds: [sim.memtable.peek(key)!.recordId] },
    io: [{ kind: 'ram-write', componentId: MEMTABLE, detail: `${key} = ${entry.value.display}, clean` }],
    snippet: { id: 'get', line: 7 },
  });
  return recorder.steps;
}

export function keyNotInTable(): readonly Step[] {
  const { sim, recorder, setBuffer } = setup();
  const key = 'nokia';
  recordMiss(recorder, key);

  let reads = 0;
  for (const table of sim.tablesNewestFirst()) reads += findInTable(recorder, setBuffer, table, key).reads;

  setBuffer(null);
  recorder.record({
    title: 'Not found anywhere',
    narration: `${key} was never written, yet the read cost ${reads} block reads, one in every table, just to confirm it is absent. Absent keys are common, so this waste adds up.`,
    outcome: 'problem',
    focus: { componentId: MEMTABLE },
    touched: sim.tables.map((table) => table.id),
    snippet: { id: 'get', line: 11 },
  });
  return recorder.steps;
}

export function keyBeforeFirstBlock(): readonly Step[] {
  const { sim, recorder, setBuffer } = setup();
  const key = 'aardvark';
  recordMiss(recorder, key);
  for (const table of sim.tablesNewestFirst()) findInTable(recorder, setBuffer, table, key);

  recorder.record({
    title: 'Not found, zero disk reads',
    narration: `Both tables start at airpods, and ${key} sorts before it, so the sparse indexes alone proved it absent. This only works for keys outside a table’s range; a missing key inside the range still costs a block read.`,
    focus: { componentId: MEMTABLE },
    touched: sim.tables.map((table) => table.id),
    snippet: { id: 'get', line: 11 },
  });
  return recorder.steps;
}
