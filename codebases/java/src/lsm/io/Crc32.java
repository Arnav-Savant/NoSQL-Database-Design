package lsm.io;

import java.util.zip.CRC32;

/** Checksums that detect torn WAL records. */
public final class Crc32 {
    private Crc32() {
    }

    // CRC-32 (IEEE 802.3, reflected polynomial 0xEDB88320). Each WAL record stores the checksum of
    // its payload so recovery can tell a complete record from one torn by a crash mid-write.
    public static long checksum(byte[] bytes) {
        CRC32 crc = new CRC32();
        crc.update(bytes, 0, bytes.length);
        return crc.getValue();
    }
}
