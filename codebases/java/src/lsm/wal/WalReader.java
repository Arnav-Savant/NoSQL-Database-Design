package lsm.wal;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import lsm.entry.Entry;
import lsm.entry.EntryCodec;
import lsm.io.Crc32;
import lsm.io.StorageDirectory;

/** Replays a write-ahead log, stopping at the first record that is incomplete or corrupt. */
public final class WalReader {
    private WalReader() {
    }

    public static WalReplay replay(StorageDirectory directory, String name) {
        byte[] bytes = directory.readAll(name);
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        List<Entry> entries = new ArrayList<>();
        int offset = 0;

        while (offset < bytes.length) {
            int remaining = bytes.length - offset;
            if (remaining < WalWriter.WAL_RECORD_HEADER_BYTES) break;

            long expectedChecksum = Integer.toUnsignedLong(buffer.getInt(offset));
            long payloadLength = Integer.toUnsignedLong(buffer.getInt(offset + 4));
            if (remaining < WalWriter.WAL_RECORD_HEADER_BYTES + payloadLength) break;

            int payloadStart = offset + WalWriter.WAL_RECORD_HEADER_BYTES;
            byte[] payload = Arrays.copyOfRange(bytes, payloadStart, payloadStart + (int) payloadLength);
            if (Crc32.checksum(payload) != expectedChecksum) break;

            entries.add(EntryCodec.decode(ByteBuffer.wrap(payload)));
            offset = payloadStart + (int) payloadLength;
        }

        // Anything after the last valid record was being written when the process died. That write
        // was never acknowledged, so dropping it loses nothing a client was promised.
        return new WalReplay(entries, offset, bytes.length - offset);
    }
}
