import { compareKeys } from '../entry/keyOrder.js';

/**
 * One entry per data block: the block's first key, where it starts, and how long it is.
 *
 * Layout: u32 blockCount | per block: u16 keyLength | first key | u32 offset | u32 length
 */
export class SparseIndex {
  constructor(blocks) {
    this.blocks = Object.freeze(blocks.map((block) => Object.freeze({ ...block })));
  }

  static fromBytes(bytes) {
    const blocks = [];
    let offset = 4;
    const blockCount = bytes.readUInt32BE(0);
    for (let i = 0; i < blockCount; i++) {
      const keyLength = bytes.readUInt16BE(offset);
      offset += 2;
      const firstKey = bytes.toString('utf8', offset, offset + keyLength);
      offset += keyLength;
      const blockOffset = bytes.readUInt32BE(offset);
      const length = bytes.readUInt32BE(offset + 4);
      offset += 8;
      blocks.push({ firstKey, offset: blockOffset, length });
    }
    return new SparseIndex(blocks);
  }

  /** The only block that can hold `key`: the last one whose first key is <= key. */
  locate(key) {
    let low = 0;
    let high = this.blocks.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (compareKeys(this.blocks[middle].firstKey, key) <= 0) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found === -1 ? null : { index: found, ...this.blocks[found] };
  }

  toBytes() {
    const parts = [Buffer.alloc(4)];
    parts[0].writeUInt32BE(this.blocks.length, 0);
    for (const block of this.blocks) {
      const keyBytes = Buffer.from(block.firstKey, 'utf8');
      const header = Buffer.alloc(2);
      header.writeUInt16BE(keyBytes.length, 0);
      const position = Buffer.alloc(8);
      position.writeUInt32BE(block.offset, 0);
      position.writeUInt32BE(block.length, 4);
      parts.push(header, keyBytes, position);
    }
    return Buffer.concat(parts);
  }
}
