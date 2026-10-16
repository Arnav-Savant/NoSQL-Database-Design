import { EntryCodec } from '../entry/entryCodec.js';
import { crc32 } from '../io/crc32.js';
import { walFileName } from '../io/fileNames.js';

export const WAL_RECORD_HEADER_BYTES = 8;

/**
 * Appends entries to one write-ahead log file.
 *
 * Record layout (big-endian): u32 crc32(payload) | u32 payloadLength | payload (an encoded Entry)
 */
export class WalWriter {
  #directory;
  #logger;
  #descriptor;

  constructor(directory, sequence, logger) {
    this.#directory = directory;
    this.#logger = logger;
    this.sequence = sequence;
    this.name = walFileName(sequence);
    this.#descriptor = directory.openForAppend(this.name);
    this.sizeBytes = directory.sizeOf(this.name);
    this.recordCount = 0;
  }

  append(entry) {
    const payload = EntryCodec.encode(entry);
    const header = Buffer.alloc(WAL_RECORD_HEADER_BYTES);
    header.writeUInt32BE(crc32(payload), 0);
    header.writeUInt32BE(payload.length, 4);
    const record = Buffer.concat([header, payload]);

    // NOTE: one fsync per write is the safest choice and the slowest. Production systems batch
    // several writes into one fsync (group commit) to trade a little latency for throughput.
    this.#directory.appendAndSync(this.#descriptor, record);
    this.sizeBytes += record.length;
    this.recordCount += 1;
    this.#logger.debug('Wal', 'appended', { wal: this.name, key: entry.key, bytes: record.length, walBytes: this.sizeBytes });
  }

  close() {
    this.#directory.closeFile(this.#descriptor);
  }
}
