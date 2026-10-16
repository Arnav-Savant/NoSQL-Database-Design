package lsm.entry;

/** Type tag stored in front of every value; the numbers are part of the on-disk format. */
public enum ValueType {
    NULL(0, "null"),
    BOOLEAN(1, "boolean"),
    NUMBER(2, "number"),
    STRING(3, "string"),
    TOMBSTONE(4, "tombstone");

    private final int tag;
    private final String typeName;

    ValueType(int tag, String typeName) {
        this.tag = tag;
        this.typeName = typeName;
    }

    public int tag() {
        return tag;
    }

    public String typeName() {
        return typeName;
    }

    public static ValueType fromTag(int tag) {
        for (ValueType type : values()) {
            if (type.tag == tag) return type;
        }
        throw new IllegalArgumentException("Unknown value type " + tag + " on disk.");
    }
}
