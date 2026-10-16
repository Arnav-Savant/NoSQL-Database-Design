package lsm.store;

import lsm.entry.Value;

/** Inserts, updates and deletes. */
public interface KeyValueWriter {
    void put(String key, Value value);

    void delete(String key);
}
