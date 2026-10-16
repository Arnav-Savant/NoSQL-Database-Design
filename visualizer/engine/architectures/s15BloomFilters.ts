import { ABSENT_KEY, DEMO_CONFIG, FALSE_POSITIVE_PROBE } from '@/content/dataset';
import { BloomModel } from '../structures/bloom';
import { tableRecords } from '../structures/sstable';
import type { TraceRecorder, Step } from '../trace';
import { describeBits, firstZeroBit, LsmSim, MEM, readThroughTable, shortName, type Table } from './s16CompleteLsm';

/** The approximate false-positive rate of a Bloom filter with n keys, m bits and k hashes. */
export function falsePositiveRate(n: number, m: number, k: number): number {
  return (1 - Math.exp((-k * n) / m)) ** k;
}

export const percent = (rate: number) => `${(rate * 100).toFixed(rate < 0.1 ? 2 : 1)}%`;

const GET_LINES = { bloom: 6, index: 7, block: 8, search: 9 } as const;

/** The table sst-000002-000002 as it stood at the demo's reads, with n, m and k of its filter. */
export function filterExample() {
  const sim = LsmSim.atChapter(7, true);
  const table = sim.tables.find((candidate) => candidate.minSeq === 2)!;
  const bloom = table.bloomModel!;
  return { sim, table, n: tableRecords(table).length, m: bloom.bitCount, k: bloom.hashCount };
}

function memtableMiss(recorder: TraceRecorder, key: string, extra: string): void {
  recorder.record({
    title: 'Memtable miss',
    narration: `get ${key} finds nothing in the memtable. ${extra}`,
    focus: { componentId: MEM },
    io: [{ kind: 'ram-read', componentId: MEM, detail: `${key}: miss` }],
    snippet: { id: 'get', line: 2 },
  });
}

export function buildFilter(): readonly Step[] {
  const { sim, table, n, m, k } = filterExample();
  const recorder = sim.recorder();
  const bloom = BloomModel.forEntryCount(n, DEMO_CONFIG.bloomBitsPerKey);
  table.status = 'writing';
  table.bloom = bloom.view();

  recorder.record({
    title: 'Size the filter for this table',
    narration: `${table.label} is being written with ${n} keys. At ${DEMO_CONFIG.bloomBitsPerKey} bits per key that asks for ${n * DEMO_CONFIG.bloomBitsPerKey} bits, raised to the engines' minimum of m = ${m}. k = round(${DEMO_CONFIG.bloomBitsPerKey} × ln 2) = ${k} hash positions per key. Every bit starts at 0.`,
    focus: { componentId: table.id },
    snippet: { id: 'add', line: 1 },
  });

  const setBy = new Map<number, string>();
  for (const record of tableRecords(table)) {
    const positions = bloom.positions(record.key);
    const shared = [...new Set(positions.filter((position) => setBy.has(position)))];
    bloom.add(record.key);
    table.bloom = bloom.view();
    for (const position of positions) if (!setBy.has(position)) setBy.set(position, record.key);
    const overlap = shared.length
      ? ` Bit ${shared.map((position) => `${position} was already set by ${setBy.get(position)}`).join(', bit ')}; setting it again changes nothing.`
      : '';
    recorder.record({
      title: `Add ${record.key}`,
      narration: `Two FNV-1a hashes of "${record.key}" give positions h1 + i·h2 mod ${m} for i = 0 to ${k - 1}: ${positions.join(', ')}. Those bits become 1.${overlap}`,
      focus: { componentId: table.id, recordIds: [record.recordId], bits: positions },
      io: [{ kind: 'ram-write', componentId: table.id, detail: `set bits ${positions.join(', ')}` }],
      snippet: { id: 'add', line: 5 },
    });
  }

  table.status = 'live';
  const setCount = bloom.bits.filter((bit) => bit === 1).length;
  recorder.record({
    title: 'Store it with the table',
    narration: `${setCount} of ${m} bits are set. The filter is written into the table file after the sparse index and loaded into RAM once when the table is opened: ${m / 8} bytes, whatever the keys look like. Its expected false-positive rate is (1 − e^(−${k}·${n}/${m}))^${k} ≈ ${percent(falsePositiveRate(n, m, k))}.`,
    focus: { componentId: table.id },
    io: [{ kind: 'disk-create', componentId: table.id, detail: `${m / 8}-byte Bloom filter section` }],
    snippet: { id: 'add', line: 7 },
  });
  return recorder.steps;
}

export function checkAbsentKey(): readonly Step[] {
  const sim = LsmSim.atChapter(7, true, 1);
  const recorder = sim.recorder();
  const key = ABSENT_KEY;
  memtableMiss(recorder, key, `It was never written. Without filters, the read would now cost one block read in each of the ${sim.tables.length} tables.`);

  const [newest, ...rest] = sim.newestFirst();
  const bloom = newest!.bloomModel!;
  const positions = bloom.positions(key);
  recorder.record({
    title: `Hash ${key}`,
    narration: `For ${newest!.label}, ${key} maps to bits ${positions.join(', ')}. Computing them takes two hash passes over the key's bytes, entirely in RAM.`,
    focus: { componentId: newest!.id, bits: positions },
    io: [{ kind: 'ram-read', componentId: newest!.id, detail: 'compute 4 positions' }],
    snippet: { id: 'check', line: 2 },
  });

  const zero = firstZeroBit(bloom, key);
  recorder.record({
    title: `Bit ${zero} is 0`,
    narration: `The bits read ${describeBits(bloom, key)}. Adding a key sets all of its bits and nothing ever clears one, so a single 0 proves ${key} was never added. ${shortName(newest!)} is skipped without reading the disk.`,
    focus: { componentId: newest!.id, bits: positions, zeroBit: zero },
    io: [{ kind: 'ram-read', componentId: newest!.id, detail: `bit ${zero} = 0` }],
    snippet: { id: 'check', line: 4 },
  });

  for (const table of rest) readThroughTable(sim, recorder, table, key, 'get', GET_LINES);

  recorder.record({
    title: 'Not found, no disk reads',
    narration: `Every table ruled ${key} out from RAM, so the read returns not found without reading a single block. A "no" from a Bloom filter is always correct.`,
    focus: { componentId: MEM },
    touched: sim.tables.map((table) => table.id),
    snippet: { id: 'get', line: 14 },
  });
  return recorder.steps;
}

export function falsePositive(): readonly Step[] {
  const sim = LsmSim.atChapter(7, true, 2);
  const recorder = sim.recorder();
  const key = FALSE_POSITIVE_PROBE;
  memtableMiss(recorder, key, 'It was never written either.');

  const tables = sim.newestFirst();
  for (const table of tables) {
    const bloom = table.bloomModel!;
    const setters = bloom
      .positions(key)
      .map((position) => `${position} by ${tableRecords(table).filter((record) => bloom.positions(record.key).includes(position)).map((record) => record.key).join(' and ')}`);
    const note = bloom.mightContain(key) ? `Other keys set them: bit ${setters.join(', bit ')}.` : '';
    const found = readThroughTable(sim, recorder, table, key, 'get', GET_LINES, note);
    if (found) break;
    if (sim.extraRam.length > 0) {
      sim.extraRam = [];
      recorder.record({
        title: 'A false positive',
        narration: `The filter said "maybe", but ${key} is not in ${shortName(table)}. That cost one wasted block read, the price of a filter that is never wrong about a "no". The read moves on to the next table.`,
        outcome: 'problem',
        focus: { componentId: table.id, bits: bloom.positions(key) },
        snippet: { id: 'get', line: 10 },
      });
    }
  }

  recorder.record({
    title: 'Not found, one block read',
    narration: `No table holds ${key}. Of the ${tables.length} tables, the filters let the read skip all but one, and that one cost a single block read.`,
    focus: { componentId: MEM },
    touched: [MEM, ...tables.map((table) => table.id)],
    snippet: { id: 'get', line: 14 },
  });
  return recorder.steps;
}

export function readWithFilters(): readonly Step[] {
  const sim = LsmSim.atChapter(9, true, 1);
  const recorder = sim.recorder();
  const key = 'kindle';
  const tables = sim.newestFirst();
  memtableMiss(recorder, key, `It was evicted to make room for pixel8, so the read checks the ${tables.length} tables, newest first.`);

  let found: ReturnType<typeof readThroughTable>;
  let table: Table | undefined;
  for (table of tables) {
    found = readThroughTable(sim, recorder, table, key, 'get', GET_LINES);
    if (found) break;
  }
  if (found && table) {
    sim.extraRam = [];
    sim.memtable.putClean(key, found.value);
    const row = sim.memtable.peek(key);
    recorder.record({
      title: `Return ${found.value.display}`,
      narration: `${key} = ${found.value.display} comes from ${shortName(table)} and is cached in the memtable as a clean entry. The whole read cost ${tables.length} filter checks in RAM and one block read.`,
      focus: { componentId: MEM, recordIds: row ? [row.recordId] : [] },
      io: [{ kind: 'ram-write', componentId: MEM, detail: `${key} = ${found.value.display}, clean` }],
      snippet: { id: 'get', line: 11 },
    });
  }
  return recorder.steps;
}
