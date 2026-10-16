import { BASE_WRITES } from '@/content/dataset';
import type { ByteCell, MachineState, RamComponent } from '../model';
import { byteRecordLength, encodeByteRecord, recordStarts } from '../structures/byteLayout';
import { TraceRecorder, type Step } from '../trace';
import { value } from '../values';

export const DATA_FILE = 'data';
export const VALUE_SLOT_BYTES = 4;

const SEED = BASE_WRITES.slice(0, 4);

/** The four records of stages 2 and 3, one cell per byte, with 4-byte float values. */
export function seedByteCells(): ByteCell[] {
  const keys = SEED.map(([key]) => key);
  const starts = recordStarts(keys);
  return SEED.flatMap(([key, raw], index) => encodeByteRecord(key, value(raw).display, starts[index]!, `${DATA_FILE}:${key}`));
}

export function fileEnd(cells: readonly ByteCell[]): number {
  return cells.reduce((end, cell) => Math.max(end, cell.offset + 1), 0);
}

/** Reads key bytes from `start` until the separator, the only way to know where the key ends. */
export function readKeyAt(cells: readonly ByteCell[], start: number): { key: string; separator: number } {
  let key = '';
  let at = start;
  for (;;) {
    const cell = cells.find((candidate) => candidate.offset === at);
    if (!cell || cell.char === ':') return { key, separator: at };
    key += cell.char;
    at++;
  }
}

/** Every key the scan visits before (and including) `target`, with its byte positions. */
export function scanTo(cells: readonly ByteCell[], target: string) {
  const visits: { key: string; start: number; separator: number; valueStart: number; valueEnd: number }[] = [];
  let at = 0;
  const end = fileEnd(cells);
  while (at < end) {
    const { key, separator } = readKeyAt(cells, at);
    const valueStart = separator + 1;
    visits.push({ key, start: at, separator, valueStart, valueEnd: valueStart + VALUE_SLOT_BYTES - 1 });
    if (key === target) return visits;
    at = valueStart + VALUE_SLOT_BYTES;
  }
  return visits;
}

export function byteFileSnapshot(cells: ByteCell[], extraDisk: () => MachineState['disk'] = () => [], ram: () => RamComponent[] = () => []) {
  return (): MachineState => ({
    ram: ram(),
    disk: [{ kind: 'byte-file', id: DATA_FILE, label: 'data.bin', cells }, ...extraDisk()],
  });
}

export function readMacbook(): readonly Step[] {
  const cells = seedByteCells();
  const recorder = new TraceRecorder(byteFileSnapshot(cells));
  const visits = scanTo(cells, 'macbook');

  for (const visit of visits) {
    const match = visit.key === 'macbook';
    recorder.record({
      title: match ? `Read the key at ${visit.start}: a match` : `Read the key at ${visit.start}`,
      narration: match
        ? `Bytes ${visit.start}–${visit.separator - 1} spell macbook, and the separator is at ${visit.separator}. This is the key we want.`
        : `Read byte by byte from offset ${visit.start} until the separator turns up at ${visit.separator}. The key is ${visit.key}, not macbook. Its length was unknown until the separator was found.`,
      focus: { componentId: DATA_FILE, byteRange: [visit.start, visit.separator] },
      io: [{ kind: 'disk-sequential-read', componentId: DATA_FILE, detail: `bytes ${visit.start}–${visit.separator}` }],
      snippet: { id: 'get', line: match ? 6 : 5 },
    });
    if (match) {
      recorder.record({
        title: 'Return the value bytes',
        narration: `The value is the ${VALUE_SLOT_BYTES} bytes after the separator, offsets ${visit.valueStart}–${visit.valueEnd}: 4.9. Every byte before it had to be read to get here, so a read is O(size of the file).`,
        focus: { componentId: DATA_FILE, byteRange: [visit.valueStart, visit.valueEnd] },
        io: [{ kind: 'disk-sequential-read', componentId: DATA_FILE, detail: `bytes ${visit.valueStart}–${visit.valueEnd}` }],
        snippet: { id: 'get', line: 6 },
      });
    } else {
      recorder.record({
        title: `Skip ${visit.key}’s value`,
        narration: `Skip the ${VALUE_SLOT_BYTES} value bytes at ${visit.valueStart}–${visit.valueEnd}. The next record starts at ${visit.valueEnd + 1}, but that was only knowable after reading this key; there is no way to jump ahead the way fixed-size rows allow.`,
        focus: { componentId: DATA_FILE, byteRange: [visit.valueStart, visit.valueEnd] },
        snippet: { id: 'get', line: 7 },
      });
    }
  }
  return recorder.steps;
}

export function insertAirpods(): readonly Step[] {
  const cells = seedByteCells();
  const recorder = new TraceRecorder(byteFileSnapshot(cells));
  const end = fileEnd(cells);
  const [key, raw] = BASE_WRITES[4]!;

  recorder.record({
    title: `The file ends at ${end}`,
    narration: `Four records of different lengths fill bytes 0–${end - 1}. A new key goes at the end, offset ${end}.`,
    focus: { componentId: DATA_FILE, byteRange: [0, end - 1] },
    snippet: { id: 'insert', line: 2 },
  });

  const length = byteRecordLength(key);
  cells.push(...encodeByteRecord(key, value(raw).display, end, `${DATA_FILE}:${key}`));
  recorder.record({
    title: `Append ${key} at ${end}`,
    narration: `${key}, the separator and the ${VALUE_SLOT_BYTES}-byte value ${value(raw).display} take ${length} bytes, ${end}–${end + length - 1}. Appending touches nothing that already exists, so it is cheap.`,
    focus: { componentId: DATA_FILE, byteRange: [end, end + length - 1] },
    io: [{ kind: 'disk-append', componentId: DATA_FILE, detail: `${key} at offset ${end}, ${length} bytes` }],
    snippet: { id: 'insert', line: 4 },
  });

  const visits = scanTo(cells, key);
  recorder.record({
    title: 'Finding it later is still a scan',
    narration: `A later read of ${key} must walk through all ${visits.length - 1} earlier keys first, byte by byte. Writes are cheap here; reads are not.`,
    focus: { componentId: DATA_FILE, byteRange: [0, end + length - 1] },
    snippet: { id: 'insert', line: 4 },
  });
  return recorder.steps;
}

export function corruptingUpdate(): readonly Step[] {
  const cells = seedByteCells();
  const recorder = new TraceRecorder(byteFileSnapshot(cells));
  const visits = scanTo(cells, 'macbook');
  const macbook = visits[visits.length - 1]!;
  const next = macbook.valueEnd + 1;
  const victim = readKeyAt(cells, next).key;
  const newValue = 'Apple';

  recorder.record({
    title: 'Scan to macbook',
    narration: `The scan reads ${visits.map((visit) => visit.key).join(', ')} and finds macbook at offset ${macbook.start}. Its value slot is bytes ${macbook.valueStart}–${macbook.valueEnd}.`,
    focus: { componentId: DATA_FILE, byteRange: [macbook.start, macbook.separator] },
    io: [{ kind: 'disk-sequential-read', componentId: DATA_FILE, detail: `bytes 0–${macbook.separator}` }],
    snippet: { id: 'update', line: 2 },
  });

  recorder.record({
    title: 'The slot is too small',
    narration: `The value is changing type, from a number to the string "${newValue}", which needs ${newValue.length} bytes. The slot holds ${VALUE_SLOT_BYTES}, and nothing in the file records that limit.`,
    focus: { componentId: DATA_FILE, byteRange: [macbook.valueStart, macbook.valueEnd] },
    snippet: { id: 'update', line: 3 },
  });

  const written = [...newValue].map((char, index) => ({ char, offset: macbook.valueStart + index }));
  const inSlot = written.filter((byte) => byte.offset <= macbook.valueEnd);
  const overflow = written.filter((byte) => byte.offset > macbook.valueEnd);
  for (const byte of inSlot) {
    const cell = cells.find((candidate) => candidate.offset === byte.offset)!;
    cell.char = byte.char;
  }
  recorder.record({
    title: `Write ${inSlot.map((byte) => byte.char).join(' ')}`,
    narration: `The first ${inSlot.length} characters fill offsets ${macbook.valueStart}–${macbook.valueEnd}, replacing 4.9. So far the write has stayed inside macbook’s record.`,
    focus: { componentId: DATA_FILE, byteRange: [macbook.valueStart, macbook.valueEnd] },
    io: [{ kind: 'disk-overwrite', componentId: DATA_FILE, detail: `bytes ${macbook.valueStart}–${macbook.valueEnd}` }],
    snippet: { id: 'update', line: 4 },
  });

  for (const byte of overflow) {
    const cell = cells.find((candidate) => candidate.offset === byte.offset)!;
    cell.char = byte.char;
    cell.role = 'overwritten';
  }
  const lastWritten = overflow[overflow.length - 1]!.offset;
  recorder.record({
    title: `The last byte lands on ${victim}`,
    narration: `"${overflow.map((byte) => byte.char).join('')}" is written to offset ${next}, which is the first byte of the next record, ${victim}. The update has silently overwritten a neighbour.`,
    outcome: 'problem',
    focus: { componentId: DATA_FILE, byteRange: [next, lastWritten] },
    io: [{ kind: 'disk-overwrite', componentId: DATA_FILE, detail: `offset ${next}, ${overflow.length} byte` }],
    snippet: { id: 'update', line: 4 },
  });

  const damaged = readKeyAt(cells, next);
  recorder.record({
    title: 'The file is corrupt',
    narration: `A scan now reads the key at ${next} as "${damaged.key}". get('${victim}') will never find its record again, and reading macbook returns only the ${VALUE_SLOT_BYTES} bytes in its slot, so even the value that was written comes back wrong.`,
    outcome: 'problem',
    focus: { componentId: DATA_FILE, byteRange: [next, damaged.separator - 1] },
    snippet: { id: 'get', line: 6 },
  });
  return recorder.steps;
}
