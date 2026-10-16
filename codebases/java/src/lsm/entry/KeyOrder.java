package lsm.entry;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.util.Arrays;
import java.util.Comparator;

/** Byte-wise key ordering shared by every port. */
public final class KeyOrder {
    // Keys are ordered by their UTF-8 bytes, compared as unsigned values. Every language port uses
    // the same rule, so a table sorted by one port can be searched by another.
    public static final Comparator<String> COMPARATOR = KeyOrder::compareKeys;

    private KeyOrder() {
    }

    public static int compareKeys(String left, String right) {
        return Arrays.compareUnsigned(left.getBytes(UTF_8), right.getBytes(UTF_8));
    }
}
