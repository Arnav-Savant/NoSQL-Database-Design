package lsm.memtable.eviction;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;

/** Least recently used: the key untouched for the longest time goes first. */
public final class LruEvictionPolicy implements EvictionPolicy {
    // A LinkedHashMap iterates in insertion order; re-inserting on access keeps the oldest use at the front.
    private final Map<String, Boolean> recency = new LinkedHashMap<>();

    @Override
    public String name() {
        return "lru";
    }

    @Override
    public void recordInsert(String key) {
        recordAccess(key);
    }

    @Override
    public void recordAccess(String key) {
        recency.remove(key);
        recency.put(key, Boolean.TRUE);
    }

    @Override
    public void recordRemoval(String key) {
        recency.remove(key);
    }

    @Override
    public Optional<String> selectVictim(Predicate<String> isEvictable) {
        for (String key : recency.keySet()) {
            if (isEvictable.test(key)) return Optional.of(key);
        }
        return Optional.empty();
    }
}
