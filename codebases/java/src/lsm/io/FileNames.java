package lsm.io;

import java.util.Optional;
import java.util.OptionalLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lsm.sstable.TableRange;

/** `wal-NNNNNN.log` and `sst-MIN-MAX.sst` naming. */
public final class FileNames {
    public static final String TEMP_SUFFIX = ".tmp";

    private static final int SEQUENCE_DIGITS = 6;
    private static final Pattern WAL_PATTERN = Pattern.compile("^wal-(\\d{6})\\.log$");
    private static final Pattern TABLE_PATTERN = Pattern.compile("^sst-(\\d{6})-(\\d{6})\\.sst$");

    private FileNames() {
    }

    public static String walFileName(long sequence) {
        return "wal-" + pad(sequence) + ".log";
    }

    public static String tableFileName(TableRange range) {
        return "sst-" + pad(range.min()) + "-" + pad(range.max()) + ".sst";
    }

    public static OptionalLong parseWalFileName(String name) {
        Matcher match = WAL_PATTERN.matcher(name);
        return match.matches() ? OptionalLong.of(Long.parseLong(match.group(1))) : OptionalLong.empty();
    }

    public static Optional<TableRange> parseTableFileName(String name) {
        Matcher match = TABLE_PATTERN.matcher(name);
        if (!match.matches()) return Optional.empty();
        return Optional.of(new TableRange(Long.parseLong(match.group(1)), Long.parseLong(match.group(2))));
    }

    public static boolean isTempFileName(String name) {
        return name.endsWith(TEMP_SUFFIX);
    }

    private static String pad(long sequence) {
        String digits = Long.toString(sequence);
        return digits.length() >= SEQUENCE_DIGITS ? digits : "0".repeat(SEQUENCE_DIGITS - digits.length()) + digits;
    }
}
