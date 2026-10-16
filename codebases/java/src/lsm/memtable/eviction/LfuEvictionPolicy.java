package lsm.memtable.eviction;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;

/** Least frequently used: the key with the fewest uses goes first; ties go to the oldest insert. */
public final class LfuEvictionPolicy implements EvictionPolicy {
    private final Map<String, Integer> useCounts = new LinkedHashMap<>();
    private final Map<String, Long> insertOrder = new LinkedHashMap<>();
    private long nextInsert = 0;

    @Override
    public String name() {
        return "lfu";
    }

    @Override
    public void recordInsert(String key) {
        useCounts.put(key, 1);
        insertOrder.put(key, nextInsert++);
    }

    @Override
    public void recordAccess(String key) {
        if (!useCounts.containsKey(key)) {
            recordInsert(key);
            return;
        }
        useCounts.put(key, useCounts.get(key) + 1);
    }

    @Override
    public void recordRemoval(String key) {
        useCounts.remove(key);
        insertOrder.remove(key);
    }

    @Override
    public Optional<String> selectVictim(Predicate<String> isEvictable) {
        String victim = null;
        for (Map.Entry<String, Integer> candidate : useCounts.entrySet()) {
            String key = candidate.getKey();
            if (!isEvictable.test(key)) continue;
            int uses = candidate.getValue();
            boolean fewerUses = victim == null || uses < useCounts.get(victim);
            boolean olderTie = victim != null && uses == useCounts.get(victim)
                    && insertOrder.get(key) < insertOrder.get(victim);
            if (fewerUses || olderTie) victim = key;
        }
        return Optional.ofNullable(victim);
    }
}
