package lsm.entry;

/** One key and its value at a point in time; a delete is an entry whose value is a tombstone. */
public record Entry(String key, Value value) {
    public Entry {
        if (key == null || key.isEmpty()) throw new IllegalArgumentException("Keys must be non-empty strings.");
        if (value == null) throw new IllegalArgumentException("Entries need a value; use Value.ofNull() for null.");
    }

    public static Entry of(String key, Value value) {
        return new Entry(key, value);
    }

    public static Entry tombstone(String key) {
        return new Entry(key, Value.tombstone());
    }

    public boolean isTombstone() {
        return value.type() == ValueType.TOMBSTONE;
    }
}
