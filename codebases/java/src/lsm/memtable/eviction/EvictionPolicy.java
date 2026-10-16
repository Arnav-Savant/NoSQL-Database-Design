package lsm.memtable.eviction;

import java.util.Optional;
import java.util.function.Predicate;

/** Decides which memtable key to drop when room is needed. */
public interface EvictionPolicy {
    String name();

    void recordInsert(String key);

    void recordAccess(String key);

    void recordRemoval(String key);

    // Returns the key to evict among those `isEvictable` accepts, or empty if none qualifies.
    Optional<String> selectVictim(Predicate<String> isEvictable);
}
