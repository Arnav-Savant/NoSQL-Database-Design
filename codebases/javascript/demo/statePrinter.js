const VALUE_TYPE_NAMES = ['null', 'boolean', 'number', 'string', 'tombstone'];

/** Renders store snapshots and raw WAL records as aligned text. */
export class StatePrinter {
  #narrator;

  constructor(narrator) {
    this.#narrator = narrator;
  }

  printSnapshot(snapshot) {
    const { activeWal, memtable, tables } = snapshot;
    const dirty = memtable.rows.filter((row) => row.state === 'dirty').length;
    const out = (text) => this.#narrator.line(text);

    out('');
    out(`  Active WAL   ${activeWal.name}  ${activeWal.sizeBytes} bytes, ${activeWal.records} records appended since opened`);
    out(`  Memtable     ${memtable.rows.length} of ${memtable.capacity} slots used, ${dirty} dirty`);
    if (memtable.rows.length > 0) {
      const keyWidth = Math.max(3, ...memtable.rows.map((row) => row.key.length));
      const valueWidth = Math.max(5, ...memtable.rows.map((row) => row.value.length));
      out(`               ${'key'.padEnd(keyWidth)}  ${'value'.padEnd(valueWidth)}  state`);
      for (const row of memtable.rows) out(`               ${row.key.padEnd(keyWidth)}  ${row.value.padEnd(valueWidth)}  ${row.state}`);
    }
    if (tables.length === 0) {
      out('  SSTables     none yet');
      return;
    }
    out('  SSTables     newest first');
    for (const table of tables) {
      out(`               ${table.name}  ${table.entryCount} entries, ${table.blocks.length} blocks, bloom ${table.bloom.setBits} of ${table.bloom.bitCount} bits set (k=${table.bloom.hashCount})`);
      table.blocks.forEach((block, index) => {
        out(`                 block ${index + 1}  offset ${String(block.offset).padStart(3)}  ${String(block.length).padStart(3)} bytes  first key ${block.firstKey}`);
      });
    }
  }

  printWalRecord(recordBytes) {
    const hex = (start, end) => [...recordBytes.subarray(start, end)].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
    const payloadLength = recordBytes.readUInt32BE(4);
    const keyLength = recordBytes.readUInt16BE(8);
    const keyEnd = 10 + keyLength;
    const valueType = recordBytes.readUInt8(keyEnd);
    const valueLength = recordBytes.readUInt32BE(keyEnd + 1);
    const valueStart = keyEnd + 5;
    const out = (text) => this.#narrator.line(text);

    out('');
    out(`  checksum      ${hex(0, 4)}`);
    out(`  length        ${hex(4, 8)}   payload is ${payloadLength} bytes`);
    out(`  key length    ${hex(8, 10)}`);
    out(`  key           ${hex(10, keyEnd)}   "${recordBytes.toString('utf8', 10, keyEnd)}"`);
    out(`  value type    ${hex(keyEnd, keyEnd + 1)}   ${VALUE_TYPE_NAMES[valueType]}`);
    out(`  value length  ${hex(keyEnd + 1, valueStart)}`);
    out(`  value         ${hex(valueStart, valueStart + valueLength)}   8-byte IEEE-754 double`);
  }
}
