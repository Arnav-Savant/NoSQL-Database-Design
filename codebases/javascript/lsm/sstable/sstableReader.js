import { EntryCodec } from '../entry/entryCodec.js';
import { compareKeys } from '../entry/keyOrder.js';
import { parseTableFileName } from '../io/fileNames.js';
import { BloomFilter } from './bloomFilter.js';
import { SparseIndex } from './sparseIndex.js';
import { FOOTER_BYTES, TABLE_MAGIC } from './tableFormat.js';

/** Reads one SSTable: the index and Bloom filter stay in memory, data blocks are read on demand. */
export class SSTableReader {
  #directory;
  #logger;
  #indexOffset;

  constructor({ directory, logger, name, range, entryCount, indexOffset, sparseIndex, bloom }) {
    this.#directory = directory;
    this.#logger = logger;
    this.#indexOffset = indexOffset;
    this.name = name;
    this.range = range;
    this.entryCount = entryCount;
    this.sparseIndex = sparseIndex;
    this.bloom = bloom;
  }

  static open(directory, name, hasher, logger) {
    const range = parseTableFileName(name);
    if (range === null) throw new Error(`"${name}" is not an SSTable file name.`);
    const fileSize = directory.sizeOf(name);
    const footer = directory.readRange(name, fileSize - FOOTER_BYTES, FOOTER_BYTES);
    if (footer.readUInt32BE(12) !== TABLE_MAGIC) throw new Error(`${name} has no valid SSTable footer.`);

    const indexOffset = footer.readUInt32BE(0);
    const bloomOffset = footer.readUInt32BE(4);
    const entryCount = footer.readUInt32BE(8);
    const sparseIndex = SparseIndex.fromBytes(directory.readRange(name, indexOffset, bloomOffset - indexOffset));
    const bloom = BloomFilter.fromBytes(directory.readRange(name, bloomOffset, fileSize - FOOTER_BYTES - bloomOffset), hasher);
    return new SSTableReader({ directory, logger, name, range, entryCount, indexOffset, sparseIndex, bloom });
  }

  mightContain(key) {
    return this.bloom.mightContain(key);
  }

  /** Reads at most one block from disk; returns the entry (possibly a tombstone) or null. */
  find(key) {
    const block = this.sparseIndex.locate(key);
    if (block === null) {
      this.#logger.debug('SSTable', 'key sorts before the first block, no read needed', { table: this.name, key });
      return null;
    }
    const entries = EntryCodec.decodeAll(this.#directory.readRange(this.name, block.offset, block.length));
    this.#logger.debug('SSTable', 'block read', { table: this.name, block: block.index + 1, firstKey: block.firstKey, bytes: block.length });

    let low = 0;
    let high = entries.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const order = compareKeys(entries[middle].key, key);
      if (order === 0) return entries[middle];
      if (order < 0) low = middle + 1;
      else high = middle - 1;
    }
    return null;
  }

  readAllEntries() {
    return EntryCodec.decodeAll(this.#directory.readRange(this.name, 0, this.#indexOffset));
  }

  describe() {
    return {
      name: this.name,
      minSequence: this.range.min,
      maxSequence: this.range.max,
      entryCount: this.entryCount,
      blocks: this.sparseIndex.blocks.map((block) => ({ ...block })),
      bloom: { bitCount: this.bloom.bitCount, hashCount: this.bloom.hashCount, setBits: this.bloom.setBitCount() },
    };
  }
}
