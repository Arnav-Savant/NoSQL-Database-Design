package lsm.logging;

import java.util.Locale;

/** Severity of a log line; lines below the logger's threshold are dropped. */
public enum LogLevel {
    DEBUG(10),
    INFO(20),
    WARN(30),
    ERROR(40);

    private final int severity;

    LogLevel(int severity) {
        this.severity = severity;
    }

    public int severity() {
        return severity;
    }

    public static LogLevel parse(String name) {
        for (LogLevel level : values()) {
            if (level.name().equals(name.toUpperCase(Locale.ROOT))) return level;
        }
        throw new IllegalArgumentException("Unknown log level \"" + name + "\". Use debug, info, warn or error.");
    }
}
