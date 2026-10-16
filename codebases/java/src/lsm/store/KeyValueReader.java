package lsm.store;

import java.util.Optional;
import lsm.entry.Value;

/** Point lookups by key. */
public interface KeyValueReader {
    // Returns the current Value, or empty when the key is absent or deleted.
    Optional<Value> get(String key);
}
