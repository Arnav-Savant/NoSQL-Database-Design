package lsm.memtable.eviction;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;

/** First in, first out: the key inserted earliest goes first, regardless of use. */
public final class FifoEvictionPolicy implements EvictionPolicy {
    private final Map<String, Boolean> arrivals = new LinkedHashMap<>();

    @Override
    public String name() {
        return "fifo";
    }

    @Override
    public void recordInsert(String key) {
        arrivals.putIfAbsent(key, Boolean.TRUE);
    }

    @Override
    public void recordAccess(String key) {
        recordInsert(key);
    }

    @Override
    public void recordRemoval(String key) {
        arrivals.remove(key);
    }

    @Override
    public Optional<String> selectVictim(Predicate<String> isEvictable) {
        for (String key : arrivals.keySet()) {
            if (isEvictable.test(key)) return Optional.of(key);
        }
        return Optional.empty();
    }
}
