import { EntryCodec } from '../entry/entryCodec.js';
import { tableFileName } from '../io/fileNames.js';
import { BloomFilter } from './bloomFilter.js';
import { SparseIndex } from './sparseIndex.js';
import { FOOTER_BYTES, TABLE_MAGIC } from './tableFormat.js';

/** Writes sorted entries as an immutable SSTable file. */
export class SSTableWriter {
  #directory;
  #config;
  #hasher;
  #logger;

  constructor(directory, config, hasher, logger) {
    this.#directory = directory;
    this.#config = config;
    this.#hasher = hasher;
    this.#logger = logger;
  }

  /** Entries must already be sorted by key with one entry per key. Returns the file name. */
  write(range, entries) {
    const bloom = BloomFilter.forEntryCount(entries.length, this.#config.bloomBitsPerKey, this.#hasher);
    const { dataBytes, blocks } = this.#packBlocks(entries, bloom);
    const indexBytes = new SparseIndex(blocks).toBytes();
    const bloomBytes = bloom.toBytes();

    // NOTE: offsets are 32-bit, which limits one table to 4 GiB. Real engines use 64-bit offsets.
    const footer = Buffer.alloc(FOOTER_BYTES);
    footer.writeUInt32BE(dataBytes.length, 0);
    footer.writeUInt32BE(dataBytes.length + indexBytes.length, 4);
    footer.writeUInt32BE(entries.length, 8);
    footer.writeUInt32BE(TABLE_MAGIC, 12);

    const name = tableFileName(range);
    const fileBytes = Buffer.concat([dataBytes, indexBytes, bloomBytes, footer]);
    this.#directory.writeAtomically(name, fileBytes);
    this.#logger.info('SSTable', 'written', {
      table: name,
      entries: entries.length,
      blocks: blocks.length,
      bloomBits: `${bloom.setBitCount()}/${bloom.bitCount}`,
      bytes: fileBytes.length,
    });
    return name;
  }

  #packBlocks(entries, bloom) {
    const blocks = [];
    const chunks = [];
    let offset = 0;
    let current = null;

    for (const entry of entries) {
      const encoded = EntryCodec.encode(entry);
      const blockIsFull = current !== null && current.length + encoded.length > this.#config.blockSizeBytes;
      if (current === null || blockIsFull) {
        if (current !== null) blocks.push(current);
        current = { firstKey: entry.key, offset, length: 0 };
      }
      chunks.push(encoded);
      current.length += encoded.length;
      offset += encoded.length;
      bloom.add(entry.key);
    }
    if (current !== null) blocks.push(current);
    return { dataBytes: Buffer.concat(chunks), blocks };
  }
}
