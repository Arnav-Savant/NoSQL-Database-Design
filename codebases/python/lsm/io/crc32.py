import zlib


# CRC-32 (IEEE 802.3, reflected polynomial 0xEDB88320). Each WAL record stores the checksum of
# its payload so recovery can tell a complete record from one torn by a crash mid-write.
# zlib implements exactly this variant, so its results match the table-driven JavaScript version.
def crc32(data: bytes) -> int:
    return zlib.crc32(data) & 0xFFFFFFFF
