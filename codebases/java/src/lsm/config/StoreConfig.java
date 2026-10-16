package lsm.config;

import lsm.logging.LogLevel;

/** Tunable limits of the store. */
public record StoreConfig(
        long walMaxBytes,
        int blockSizeBytes,
        int memtableCapacity,
        int compactionTrigger,
        int bloomBitsPerKey,
        String evictionPolicy,
        LogLevel logLevel) {

    public static final StoreConfig DEFAULT_CONFIG =
            new StoreConfig(4L * 1024 * 1024, 4096, 100_000, 4, 10, "lru", LogLevel.INFO);

    // Deliberately tiny so the demo triggers flushes, evictions and compactions within a few writes.
    public static final StoreConfig DEMO_CONFIG =
            new StoreConfig(128, 64, 6, 3, 6, "lru", LogLevel.DEBUG);

    public StoreConfig {
        requirePositive("walMaxBytes", walMaxBytes);
        requirePositive("blockSizeBytes", blockSizeBytes);
        requirePositive("memtableCapacity", memtableCapacity);
        requirePositive("compactionTrigger", compactionTrigger);
        requirePositive("bloomBitsPerKey", bloomBitsPerKey);
        if (compactionTrigger < 2) {
            throw new IllegalArgumentException(
                    "Config field \"compactionTrigger\" must be at least 2, because a merge needs two tables.");
        }
        if (evictionPolicy == null) throw new IllegalArgumentException("Config field \"evictionPolicy\" is required.");
        if (logLevel == null) throw new IllegalArgumentException("Config field \"logLevel\" is required.");
    }

    public StoreConfig withWalMaxBytes(long value) {
        return new StoreConfig(value, blockSizeBytes, memtableCapacity, compactionTrigger, bloomBitsPerKey, evictionPolicy, logLevel);
    }

    public StoreConfig withBlockSizeBytes(int value) {
        return new StoreConfig(walMaxBytes, value, memtableCapacity, compactionTrigger, bloomBitsPerKey, evictionPolicy, logLevel);
    }

    public StoreConfig withMemtableCapacity(int value) {
        return new StoreConfig(walMaxBytes, blockSizeBytes, value, compactionTrigger, bloomBitsPerKey, evictionPolicy, logLevel);
    }

    public StoreConfig withCompactionTrigger(int value) {
        return new StoreConfig(walMaxBytes, blockSizeBytes, memtableCapacity, value, bloomBitsPerKey, evictionPolicy, logLevel);
    }

    public StoreConfig withBloomBitsPerKey(int value) {
        return new StoreConfig(walMaxBytes, blockSizeBytes, memtableCapacity, compactionTrigger, value, evictionPolicy, logLevel);
    }

    public StoreConfig withEvictionPolicy(String value) {
        return new StoreConfig(walMaxBytes, blockSizeBytes, memtableCapacity, compactionTrigger, bloomBitsPerKey, value, logLevel);
    }

    public StoreConfig withLogLevel(LogLevel value) {
        return new StoreConfig(walMaxBytes, blockSizeBytes, memtableCapacity, compactionTrigger, bloomBitsPerKey, evictionPolicy, value);
    }

    private static void requirePositive(String field, long value) {
        if (value < 1) {
            throw new IllegalArgumentException(
                    "Config field \"" + field + "\" must be a positive integer, got " + value + ".");
        }
    }
}
