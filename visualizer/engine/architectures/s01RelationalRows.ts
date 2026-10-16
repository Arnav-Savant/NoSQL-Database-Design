import { PRODUCT_COLUMNS, PRODUCTS, ROW_BYTES } from '@/content/dataset';
import type { MachineState } from '../model';
import { TraceRecorder, type Step } from '../trace';

const TABLE = 'products';

type Row = { id: number; cells: (string | number)[] };

/** Byte position of a column inside a row: the sum of the sizes of every column before it. */
function columnOffset(name: string): number {
  let offset = 0;
  for (const column of PRODUCT_COLUMNS) {
    if (column.name === name) return offset;
    offset += column.bytes;
  }
  throw new Error(`Unknown column ${name}`);
}

function columnIndex(name: string): number {
  return PRODUCT_COLUMNS.findIndex((column) => column.name === name);
}

function columnBytes(name: string): number {
  return PRODUCT_COLUMNS[columnIndex(name)]?.bytes ?? 0;
}

function seeded() {
  const rows: Row[] = PRODUCTS.map((product) => ({ id: product.id, cells: [product.id, product.name, product.price, product.rating] }));
  const snapshot = (): MachineState => ({
    ram: [],
    disk: [
      {
        kind: 'row-file',
        id: TABLE,
        label: 'products table',
        columns: PRODUCT_COLUMNS.map((column) => ({ ...column })),
        rows,
      },
    ],
  });
  return { rows, recorder: new TraceRecorder(snapshot) };
}

const rowOffset = (index: number) => index * ROW_BYTES;
const rowFocus = (id: number, column?: string) => ({
  componentId: TABLE,
  recordIds: [`row:${id}`],
  blockIndex: column === undefined ? undefined : columnIndex(column),
});

export function findById(): readonly Step[] {
  const { rows, recorder } = seeded();
  const target = 3;
  const idBytes = columnBytes('id');

  recorder.record({
    title: 'Every row is the same size',
    narration: `The schema fixes each column’s size: ${PRODUCT_COLUMNS.map((c) => `${c.name} ${c.bytes}`).join(', ')} bytes. So every row is exactly ${ROW_BYTES} bytes, and row n starts at n × ${ROW_BYTES}.`,
    focus: { componentId: TABLE },
    snippet: { id: 'find', line: 2 },
  });

  for (const [index, row] of rows.entries()) {
    const offset = rowOffset(index);
    const match = row.id === target;
    recorder.record({
      title: match ? `Read the id at ${offset}: a match` : `Read the id at ${offset}`,
      narration: match
        ? `The id at offset ${offset} is ${row.id}, the one we want. Only ${idBytes} bytes of each earlier row were read.`
        : index === 0
          ? `Read only the ${idBytes}-byte id field at offset ${offset}. It is ${row.id}, not ${target}, so the other ${ROW_BYTES - idBytes} bytes of the row are skipped without being read.`
          : `Jump ${ROW_BYTES} bytes to offset ${offset} and read the id: ${row.id}. Not a match, so jump again. The jump is arithmetic, not a search.`,
      focus: rowFocus(row.id, 'id'),
      io: [{ kind: 'disk-sequential-read', componentId: TABLE, detail: `id at offset ${offset}, ${idBytes} bytes` }],
      snippet: { id: 'find', line: match ? 5 : 4 },
    });
    if (match) {
      recorder.record({
        title: 'Read the whole row',
        narration: `Read the ${ROW_BYTES} bytes from offset ${offset}: ${row.cells.join(', ')}. The rows sit next to each other, so these jumps stay in neighbouring disk blocks and the access is nearly sequential.`,
        focus: rowFocus(row.id),
        io: [{ kind: 'disk-sequential-read', componentId: TABLE, detail: `row at offset ${offset}, ${ROW_BYTES} bytes` }],
        snippet: { id: 'find', line: 5 },
      });
      break;
    }
  }
  return recorder.steps;
}

export function updatePrice(): readonly Step[] {
  const { rows, recorder } = seeded();
  const id = 2;
  const newPrice = 749;
  const index = rows.findIndex((row) => row.id === id);
  const row = rows[index]!;
  const start = rowOffset(index);
  const inRow = columnOffset('price');
  const priceBytes = columnBytes('price');
  const priceColumn = columnIndex('price');
  const oldPrice = row.cells[priceColumn];

  recorder.record({
    title: `Locate row ${id}`,
    narration: `Row ${id} starts at offset ${start}, found the same way as before: read the id at 0, jump ${ROW_BYTES} bytes, read the id again.`,
    focus: rowFocus(id),
    io: [{ kind: 'disk-sequential-read', componentId: TABLE, detail: `ids at offsets 0 and ${start}` }],
    snippet: { id: 'update', line: 2 },
  });

  recorder.record({
    title: 'Compute where the price is',
    narration: `The price column comes after id (${columnBytes('id')} bytes) and name (${columnBytes('name')} bytes), so it starts ${inRow} bytes into the row: offset ${start} + ${inRow} = ${start + inRow}.`,
    focus: rowFocus(id, 'price'),
    snippet: { id: 'update', line: 3 },
  });

  row.cells[priceColumn] = newPrice;
  recorder.record({
    title: `Overwrite ${priceBytes} bytes at ${start + inRow}`,
    narration: `${oldPrice} becomes ${newPrice} in the same ${priceBytes}-byte slot. The container never changes size, only its contents.`,
    focus: rowFocus(id, 'price'),
    io: [{ kind: 'disk-overwrite', componentId: TABLE, detail: `offset ${start + inRow}, ${priceBytes} bytes` }],
    snippet: { id: 'update', line: 4 },
  });

  recorder.record({
    title: 'Nothing else moved',
    narration: `Every other row is still exactly where it was, so every address computed before the update is still correct. That is what makes in-place updates safe here.`,
    focus: { componentId: TABLE, recordIds: rows.filter((other) => other.id !== id).map((other) => `row:${other.id}`) },
    snippet: { id: 'update', line: 4 },
  });
  return recorder.steps;
}

export function insertRow(): readonly Step[] {
  const { rows, recorder } = seeded();
  const end = rowOffset(rows.length);

  recorder.record({
    title: 'Find the end of the file',
    narration: `The file holds ${rows.length} rows of ${ROW_BYTES} bytes, so it ends at ${rows.length} × ${ROW_BYTES} = ${end}. No scan is needed to know that.`,
    focus: rowFocus(rows[rows.length - 1]!.id),
    snippet: { id: 'insert', line: 3 },
  });

  const product = { id: 5, name: 'AirPods', price: 179, rating: 4.5 };
  rows.push({ id: product.id, cells: [product.id, product.name, product.price, product.rating] });
  recorder.record({
    title: `Append ${ROW_BYTES} bytes at ${end}`,
    narration: `Row ${product.id} is written at offset ${end}. Rows are ordered by id and ${product.id} is the largest, so the new row simply goes last.`,
    focus: rowFocus(product.id),
    io: [{ kind: 'disk-append', componentId: TABLE, detail: `row ${product.id} at offset ${end}, ${ROW_BYTES} bytes` }],
    snippet: { id: 'insert', line: 4 },
  });

  const nameBytes = columnBytes('name');
  recorder.record({
    title: 'Short names still fill the slot',
    narration: `"${product.name}" is ${product.name.length} characters, but the name column is always ${nameBytes} bytes, so ${nameBytes - product.name.length} bytes are padding. Fixed sizes trade wasted space for computable addresses.`,
    focus: rowFocus(product.id, 'name'),
    snippet: { id: 'insert', line: 4 },
  });
  return recorder.steps;
}
