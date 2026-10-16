// SSTable file layout:
//
//   data blocks   entries sorted by key, packed into blocks of at most blockSizeBytes
//   sparse index  first key, offset and length of every block
//   bloom filter  bits for every key in the table
//   footer        u32 indexOffset | u32 bloomOffset | u32 entryCount | u32 magic, 16 bytes in total
export const FOOTER_BYTES = 16;
export const TABLE_MAGIC = 0x4c534d31; // "LSM1"
