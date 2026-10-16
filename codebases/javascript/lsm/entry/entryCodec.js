import { Entry } from './entry.js';
import { Value, ValueType } from './value.js';

const MAX_KEY_BYTES = 0xffff;
const HEADER_BYTES = 2 + 1 + 4;

/**
 * Serialises entries to bytes and back.
 *
 * Layout (big-endian): u16 keyLength | key UTF-8 | u8 valueType | u32 valueLength | value bytes
 */
export class EntryCodec {
  static encode(entry) {
    const keyBytes = Buffer.from(entry.key, 'utf8');
    if (keyBytes.length > MAX_KEY_BYTES) throw new Error(`Key "${entry.key.slice(0, 20)}…" exceeds ${MAX_KEY_BYTES} bytes.`);
    const valueBytes = encodeValue(entry.value);

    const buffer = Buffer.alloc(HEADER_BYTES + keyBytes.length + valueBytes.length);
    let offset = buffer.writeUInt16BE(keyBytes.length, 0);
    offset += keyBytes.copy(buffer, offset);
    offset = buffer.writeUInt8(entry.value.type, offset);
    offset = buffer.writeUInt32BE(valueBytes.length, offset);
    valueBytes.copy(buffer, offset);
    return buffer;
  }

  static decode(buffer, start) {
    let offset = start;
    const keyLength = buffer.readUInt16BE(offset);
    offset += 2;
    const key = buffer.toString('utf8', offset, offset + keyLength);
    offset += keyLength;
    const type = buffer.readUInt8(offset);
    offset += 1;
    const valueLength = buffer.readUInt32BE(offset);
    offset += 4;
    if (offset + valueLength > buffer.length) throw new RangeError('Entry extends past the end of the buffer.');
    const value = decodeValue(type, buffer.subarray(offset, offset + valueLength));
    offset += valueLength;
    return { entry: new Entry(key, value), bytesRead: offset - start };
  }

  static decodeAll(buffer) {
    const entries = [];
    for (let offset = 0; offset < buffer.length; ) {
      const { entry, bytesRead } = EntryCodec.decode(buffer, offset);
      entries.push(entry);
      offset += bytesRead;
    }
    return entries;
  }
}

function encodeValue(value) {
  switch (value.type) {
    case ValueType.NULL:
    case ValueType.TOMBSTONE:
      return Buffer.alloc(0);
    case ValueType.BOOLEAN:
      return Buffer.from([value.data ? 1 : 0]);
    case ValueType.NUMBER: {
      const bytes = Buffer.alloc(8);
      bytes.writeDoubleBE(value.data, 0);
      return bytes;
    }
    case ValueType.STRING:
      return Buffer.from(value.data, 'utf8');
    default:
      throw new Error(`Unknown value type ${value.type}.`);
  }
}

function decodeValue(type, bytes) {
  switch (type) {
    case ValueType.NULL:
      return Value.null();
    case ValueType.TOMBSTONE:
      return Value.tombstone();
    case ValueType.BOOLEAN:
      return Value.boolean(bytes[0] === 1);
    case ValueType.NUMBER:
      return Value.number(bytes.readDoubleBE(0));
    case ValueType.STRING:
      return Value.string(bytes.toString('utf8'));
    default:
      throw new Error(`Unknown value type ${type} on disk.`);
  }
}
