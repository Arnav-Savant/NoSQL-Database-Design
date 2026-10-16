package lsm.entry;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

/**
 * Serialises entries to bytes and back; layout (big-endian): u16 keyLength | key UTF-8 | u8 valueType | u32 valueLength | value bytes.
 */
public final class EntryCodec {
    private static final int MAX_KEY_BYTES = 0xFFFF;
    private static final int HEADER_BYTES = 2 + 1 + 4;

    private EntryCodec() {
    }

    public static byte[] encode(Entry entry) {
        byte[] keyBytes = entry.key().getBytes(UTF_8);
        if (keyBytes.length > MAX_KEY_BYTES) {
            String head = entry.key().substring(0, Math.min(20, entry.key().length()));
            throw new IllegalArgumentException("Key \"" + head + "…\" exceeds " + MAX_KEY_BYTES + " bytes.");
        }
        byte[] valueBytes = encodeValue(entry.value());

        ByteBuffer buffer = ByteBuffer.allocate(HEADER_BYTES + keyBytes.length + valueBytes.length);
        buffer.putShort((short) keyBytes.length);
        buffer.put(keyBytes);
        buffer.put((byte) entry.value().type().tag());
        buffer.putInt(valueBytes.length);
        buffer.put(valueBytes);
        return buffer.array();
    }

    // Decodes one entry starting at the buffer's position and advances the position past it.
    public static Entry decode(ByteBuffer buffer) {
        int keyLength = Short.toUnsignedInt(buffer.getShort());
        byte[] keyBytes = new byte[keyLength];
        buffer.get(keyBytes);
        int type = Byte.toUnsignedInt(buffer.get());
        long valueLength = Integer.toUnsignedLong(buffer.getInt());
        if (valueLength > buffer.remaining()) {
            throw new IndexOutOfBoundsException("Entry extends past the end of the buffer.");
        }
        byte[] valueBytes = new byte[(int) valueLength];
        buffer.get(valueBytes);
        return new Entry(new String(keyBytes, UTF_8), decodeValue(type, valueBytes));
    }

    public static List<Entry> decodeAll(byte[] bytes) {
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        List<Entry> entries = new ArrayList<>();
        while (buffer.hasRemaining()) entries.add(decode(buffer));
        return entries;
    }

    private static byte[] encodeValue(Value value) {
        return switch (value.type()) {
            case NULL, TOMBSTONE -> new byte[0];
            case BOOLEAN -> new byte[] {(byte) ((Boolean) value.data() ? 1 : 0)};
            case NUMBER -> ByteBuffer.allocate(8).putDouble((Double) value.data()).array();
            case STRING -> ((String) value.data()).getBytes(UTF_8);
        };
    }

    private static Value decodeValue(int tag, byte[] bytes) {
        return switch (ValueType.fromTag(tag)) {
            case NULL -> Value.ofNull();
            case TOMBSTONE -> Value.tombstone();
            case BOOLEAN -> Value.ofBoolean(bytes[0] == 1);
            case NUMBER -> Value.ofNumber(ByteBuffer.wrap(bytes).getDouble());
            case STRING -> Value.ofString(new String(bytes, UTF_8));
        };
    }
}
