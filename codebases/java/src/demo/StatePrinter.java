package demo;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.nio.ByteBuffer;
import java.util.List;
import lsm.entry.ValueType;
import lsm.memtable.EntryState;
import lsm.sstable.BlockHandle;
import lsm.store.StoreSnapshot;

/** Renders store snapshots and raw WAL records as aligned text. */
public final class StatePrinter {
    private final Narrator narrator;

    public StatePrinter(Narrator narrator) {
        this.narrator = narrator;
    }

    public void printSnapshot(StoreSnapshot snapshot) {
        StoreSnapshot.ActiveWal activeWal = snapshot.activeWal();
        StoreSnapshot.MemtableView memtable = snapshot.memtable();
        List<StoreSnapshot.MemtableRow> rows = memtable.rows();
        long dirty = rows.stream().filter(row -> row.state() == EntryState.DIRTY).count();

        out("");
        out("  Active WAL   " + activeWal.name() + "  " + activeWal.sizeBytes() + " bytes, " + activeWal.records()
                + " records appended since opened");
        out("  Memtable     " + rows.size() + " of " + memtable.capacity() + " slots used, " + dirty + " dirty");
        if (!rows.isEmpty()) {
            int keyWidth = 3;
            int valueWidth = 5;
            for (StoreSnapshot.MemtableRow row : rows) {
                keyWidth = Math.max(keyWidth, row.key().length());
                valueWidth = Math.max(valueWidth, row.value().length());
            }
            out("               " + padEnd("key", keyWidth) + "  " + padEnd("value", valueWidth) + "  state");
            for (StoreSnapshot.MemtableRow row : rows) {
                out("               " + padEnd(row.key(), keyWidth) + "  " + padEnd(row.value(), valueWidth) + "  " + row.state());
            }
        }
        if (snapshot.tables().isEmpty()) {
            out("  SSTables     none yet");
            return;
        }
        out("  SSTables     newest first");
        for (StoreSnapshot.TableView table : snapshot.tables()) {
            out("               " + table.name() + "  " + table.entryCount() + " entries, " + table.blocks().size()
                    + " blocks, bloom " + table.bloom().setBits() + " of " + table.bloom().bitCount() + " bits set (k="
                    + table.bloom().hashCount() + ")");
            for (int index = 0; index < table.blocks().size(); index++) {
                BlockHandle block = table.blocks().get(index);
                out("                 block " + (index + 1) + "  offset " + padStart(String.valueOf(block.offset()), 3) + "  "
                        + padStart(String.valueOf(block.length()), 3) + " bytes  first key " + block.firstKey());
            }
        }
    }

    public void printWalRecord(byte[] recordBytes) {
        ByteBuffer buffer = ByteBuffer.wrap(recordBytes);
        long payloadLength = Integer.toUnsignedLong(buffer.getInt(4));
        int keyLength = Short.toUnsignedInt(buffer.getShort(8));
        int keyEnd = 10 + keyLength;
        int valueType = Byte.toUnsignedInt(buffer.get(keyEnd));
        int valueLength = buffer.getInt(keyEnd + 1);
        int valueStart = keyEnd + 5;

        out("");
        out("  checksum      " + hex(recordBytes, 0, 4));
        out("  length        " + hex(recordBytes, 4, 8) + "   payload is " + payloadLength + " bytes");
        out("  key length    " + hex(recordBytes, 8, 10));
        out("  key           " + hex(recordBytes, 10, keyEnd) + "   \"" + new String(recordBytes, 10, keyLength, UTF_8) + "\"");
        out("  value type    " + hex(recordBytes, keyEnd, keyEnd + 1) + "   " + ValueType.fromTag(valueType).typeName());
        out("  value length  " + hex(recordBytes, keyEnd + 1, valueStart));
        out("  value         " + hex(recordBytes, valueStart, valueStart + valueLength) + "   8-byte IEEE-754 double");
    }

    private void out(String text) {
        narrator.line(text);
    }

    private static String hex(byte[] bytes, int start, int end) {
        StringBuilder text = new StringBuilder();
        for (int i = start; i < end; i++) {
            if (i > start) text.append(' ');
            text.append(String.format("%02x", bytes[i] & 0xFF));
        }
        return text.toString();
    }

    private static String padEnd(String text, int width) {
        return text.length() >= width ? text : text + " ".repeat(width - text.length());
    }

    private static String padStart(String text, int width) {
        return text.length() >= width ? text : " ".repeat(width - text.length()) + text;
    }
}
