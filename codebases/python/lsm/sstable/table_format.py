import struct

# SSTable file layout:
#
#   data blocks   entries sorted by key, packed into blocks of at most block_size_bytes
#   sparse index  first key, offset and length of every block
#   bloom filter  bits for every key in the table
#   footer        u32 indexOffset | u32 bloomOffset | u32 entryCount | u32 magic, 16 bytes in total
FOOTER = struct.Struct(">IIII")
FOOTER_BYTES = FOOTER.size
TABLE_MAGIC = 0x4C534D31  # "LSM1"
