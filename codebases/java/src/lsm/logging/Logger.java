package lsm.logging;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** Structured logging contract used by every component. */
public interface Logger {
    void write(LogLevel level, String component, String message, Map<String, Object> fields);

    // Fields are passed as alternating name/value pairs so they keep the order they were written in.
    default void debug(String component, String message, Object... fields) {
        write(LogLevel.DEBUG, component, message, pairs(fields));
    }

    default void info(String component, String message, Object... fields) {
        write(LogLevel.INFO, component, message, pairs(fields));
    }

    default void warn(String component, String message, Object... fields) {
        write(LogLevel.WARN, component, message, pairs(fields));
    }

    default void error(String component, String message, Object... fields) {
        write(LogLevel.ERROR, component, message, pairs(fields));
    }

    private static Map<String, Object> pairs(Object... fields) {
        if (fields.length % 2 != 0) throw new IllegalArgumentException("Log fields must be name/value pairs.");
        Map<String, Object> ordered = new LinkedHashMap<>();
        for (int i = 0; i < fields.length; i += 2) ordered.put(String.valueOf(fields[i]), fields[i + 1]);
        return Collections.unmodifiableMap(ordered);
    }
}
