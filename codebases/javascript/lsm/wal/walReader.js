import { EntryCodec } from '../entry/entryCodec.js';
import { crc32 } from '../io/crc32.js';
import { WAL_RECORD_HEADER_BYTES } from './walWriter.js';

/** Replays a write-ahead log, stopping at the first record that is incomplete or corrupt. */
export class WalReader {
  static replay(directory, name) {
    const bytes = directory.readAll(name);
    const entries = [];
    let offset = 0;

    while (offset < bytes.length) {
      const remaining = bytes.length - offset;
      if (remaining < WAL_RECORD_HEADER_BYTES) break;

      const expectedChecksum = bytes.readUInt32BE(offset);
      const payloadLength = bytes.readUInt32BE(offset + 4);
      if (remaining < WAL_RECORD_HEADER_BYTES + payloadLength) break;

      const payloadStart = offset + WAL_RECORD_HEADER_BYTES;
      const payload = bytes.subarray(payloadStart, payloadStart + payloadLength);
      if (crc32(payload) !== expectedChecksum) break;

      entries.push(EntryCodec.decode(payload, 0).entry);
      offset = payloadStart + payloadLength;
    }

    // Anything after the last valid record was being written when the process died. That write
    // was never acknowledged, so dropping it loses nothing a client was promised.
    return { entries, lastGoodOffset: offset, tornBytes: bytes.length - offset };
  }
}
