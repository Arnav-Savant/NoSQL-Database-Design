import type { ByteCell, DiskComponent, RamComponent } from '../model';
import { TraceRecorder, type Step } from '../trace';
import { value } from '../values';
import { byteFileSnapshot, DATA_FILE, fileEnd, readKeyAt, scanTo, seedByteCells, VALUE_SLOT_BYTES } from './s02NaiveKeyValue';

const OVERFLOW = 'overflow';
const BUFFER = 'read-buffer';
const POINTER_BYTES = 2;
const SPILL_OFFSET = 60000;
const NEW_VALUE = 'Apple';

/** Compact label for a pointer target, small enough for one byte cell. */
function pointerLabel(target: number): string {
  return target >= 1000 ? `${Math.round(target / 1000)}k` : String(target);
}

function setup(applied: boolean) {
  const cells = seedByteCells();
  const spill: ByteCell[] = [];
  let showOverflow = applied;
  let buffer: { key: string; target: string }[] | undefined;

  const visits = scanTo(cells, 'macbook');
  const macbook = visits[visits.length - 1]!;
  const fits = VALUE_SLOT_BYTES - POINTER_BYTES;
  const head = NEW_VALUE.slice(0, fits);
  const tail = NEW_VALUE.slice(fits);
  const pointerStart = macbook.valueStart + fits;
  const recordId = `${DATA_FILE}:macbook`;

  const writeHead = () => {
    [...head].forEach((char, index) => {
      cells.find((cell) => cell.offset === macbook.valueStart + index)!.char = char;
    });
  };
  const writeSpill = () => {
    showOverflow = true;
    [...tail].forEach((char, index) => spill.push({ offset: SPILL_OFFSET + index, char, role: 'spill', recordId }));
  };
  const writePointer = () => {
    const chars = ['→', pointerLabel(SPILL_OFFSET)];
    chars.forEach((char, index) => {
      const cell = cells.find((candidate) => candidate.offset === pointerStart + index)!;
      cell.char = char;
      cell.role = 'pointer';
    });
  };
  if (applied) {
    writeHead();
    writeSpill();
    writePointer();
  }

  const extraDisk = (): DiskComponent[] =>
    showOverflow ? [{ kind: 'byte-file', id: OVERFLOW, label: `Same file, offset ${SPILL_OFFSET}`, cells: spill }] : [];
  const ram = (): RamComponent[] => (buffer ? [{ kind: 'offset-map', id: BUFFER, label: 'Value being read', rows: buffer }] : []);
  const recorder = new TraceRecorder(byteFileSnapshot(cells, extraDisk, ram));
  return {
    cells,
    recorder,
    visits,
    macbook,
    fits,
    head,
    tail,
    pointerStart,
    writeHead,
    writeSpill,
    writePointer,
    setBuffer: (rows: { key: string; target: string }[]) => {
      buffer = rows;
    },
  };
}

export function pointerUpdate(): readonly Step[] {
  const { cells, recorder, visits, macbook, fits, head, tail, pointerStart, writeHead, writeSpill, writePointer } = setup(false);
  const tailEnd = SPILL_OFFSET + tail.length - 1;

  recorder.record({
    title: 'Scan to macbook',
    narration: `As before, the scan reads ${visits.map((visit) => visit.key).join(', ')} byte by byte and finds macbook at offset ${macbook.start}. Its value slot is bytes ${macbook.valueStart}–${macbook.valueEnd}.`,
    focus: { componentId: DATA_FILE, byteRange: [macbook.start, macbook.separator] },
    io: [{ kind: 'disk-sequential-read', componentId: DATA_FILE, detail: `bytes 0–${macbook.separator}` }],
    snippet: { id: 'update', line: 2 },
  });

  recorder.record({
    title: 'Reserve room for a pointer',
    narration: `"${NEW_VALUE}" needs ${NEW_VALUE.length} bytes and the slot has ${VALUE_SLOT_BYTES}. The last ${POINTER_BYTES} bytes are kept for a pointer, a small address that says where the rest of the value is, which leaves ${fits} bytes for data.`,
    focus: { componentId: DATA_FILE, byteRange: [macbook.valueStart, macbook.valueEnd] },
    snippet: { id: 'update', line: 3 },
  });

  writeHead();
  recorder.record({
    title: `Write ${[...head].join(' ')}`,
    narration: `The first ${fits} characters go into offsets ${macbook.valueStart}–${pointerStart - 1}, inside macbook’s own slot.`,
    focus: { componentId: DATA_FILE, byteRange: [macbook.valueStart, pointerStart - 1] },
    io: [{ kind: 'disk-overwrite', componentId: DATA_FILE, detail: `bytes ${macbook.valueStart}–${pointerStart - 1}` }],
    snippet: { id: 'update', line: 4 },
  });

  writeSpill();
  recorder.record({
    title: 'Spill the rest far away',
    narration: `The remaining "${tail}" is written into free space at offset ${SPILL_OFFSET}, far from the record. A ${POINTER_BYTES}-byte pointer can address up to 65,535, so the location must fit in that range.`,
    focus: { componentId: OVERFLOW, byteRange: [SPILL_OFFSET, tailEnd] },
    io: [{ kind: 'disk-overwrite', componentId: OVERFLOW, detail: `seek to offset ${SPILL_OFFSET}, ${tail.length} bytes` }],
    snippet: { id: 'update', line: 6 },
  });

  writePointer();
  recorder.record({
    title: 'Write the pointer',
    narration: `Offsets ${pointerStart}–${macbook.valueEnd} now hold the address ${SPILL_OFFSET}. It is a linked list, stored on disk: the slot links to the next piece of the value.`,
    focus: { componentId: DATA_FILE, byteRange: [pointerStart, macbook.valueEnd] },
    io: [{ kind: 'disk-overwrite', componentId: DATA_FILE, detail: `bytes ${pointerStart}–${macbook.valueEnd}, pointer to ${SPILL_OFFSET}` }],
    snippet: { id: 'update', line: 7 },
  });

  const next = macbook.valueEnd + 1;
  const neighbour = readKeyAt(cells, next);
  recorder.record({
    title: `${neighbour.key} is untouched`,
    narration: `Nothing was written past offset ${macbook.valueEnd}, so ${neighbour.key} still starts cleanly at ${next}. The corruption is gone, but the value now lives in two places.`,
    focus: { componentId: DATA_FILE, byteRange: [next, fileEnd(cells) - 1] },
    snippet: { id: 'update', line: 8 },
  });
  return recorder.steps;
}

export function pointerRead(): readonly Step[] {
  const { recorder, visits, macbook, head, tail, pointerStart, setBuffer } = setup(true);
  const tailEnd = SPILL_OFFSET + tail.length - 1;

  recorder.record({
    title: 'Scan to macbook',
    narration: `Finding the key is still a linear scan: ${visits.map((visit) => visit.key).join(', ')}. macbook starts at offset ${macbook.start}.`,
    focus: { componentId: DATA_FILE, byteRange: [macbook.start, macbook.separator] },
    io: [{ kind: 'disk-sequential-read', componentId: DATA_FILE, detail: `bytes 0–${macbook.separator}` }],
    snippet: { id: 'get', line: 2 },
  });

  setBuffer([{ key: 'macbook, part 1', target: value(head).display }]);
  recorder.record({
    title: `Read ${[...head].join(' ')}`,
    narration: `The data part of the slot, offsets ${macbook.valueStart}–${pointerStart - 1}, gives "${head}". The disk head is already here, so this read is cheap.`,
    focus: { componentId: DATA_FILE, byteRange: [macbook.valueStart, pointerStart - 1] },
    touched: [DATA_FILE, BUFFER],
    io: [
      { kind: 'disk-sequential-read', componentId: DATA_FILE, detail: `bytes ${macbook.valueStart}–${pointerStart - 1}` },
      { kind: 'ram-write', componentId: BUFFER, detail: `"${head}"` },
    ],
    snippet: { id: 'get', line: 4 },
  });

  recorder.record({
    title: 'Hit the pointer',
    narration: `Offsets ${pointerStart}–${macbook.valueEnd} are not data but an address: the rest of the value is at ${SPILL_OFFSET}.`,
    focus: { componentId: DATA_FILE, byteRange: [pointerStart, macbook.valueEnd] },
    io: [{ kind: 'disk-sequential-read', componentId: DATA_FILE, detail: `pointer to ${SPILL_OFFSET}` }],
    snippet: { id: 'get', line: 5 },
  });

  setBuffer([
    { key: 'macbook, part 1', target: value(head).display },
    { key: 'macbook, part 2', target: value(tail).display },
  ]);
  recorder.record({
    title: `Seek to ${SPILL_OFFSET}`,
    narration: `The disk jumps to an unrelated location to read "${tail}". On a spinning disk that is a head movement of around 10 milliseconds; on an SSD it is a separate request. Disks are fast at sequential reads and slow at random ones.`,
    focus: { componentId: OVERFLOW, byteRange: [SPILL_OFFSET, tailEnd] },
    touched: [OVERFLOW, BUFFER],
    io: [
      { kind: 'disk-random-read', componentId: OVERFLOW, detail: `offset ${SPILL_OFFSET}, ${tail.length} bytes` },
      { kind: 'ram-write', componentId: BUFFER, detail: `"${tail}"` },
    ],
    snippet: { id: 'get', line: 6 },
  });

  setBuffer([{ key: 'macbook', target: value(head + tail).display }]);
  recorder.record({
    title: `Combine into "${head + tail}"`,
    narration: `The two pieces join into "${head + tail}". One logical read cost a scan plus a random seek, and a value that grows again becomes a longer chain with one more seek per link.`,
    focus: { componentId: BUFFER },
    io: [{ kind: 'ram-write', componentId: BUFFER, detail: `"${head}" + "${tail}"` }],
    snippet: { id: 'get', line: 7 },
  });
  return recorder.steps;
}
