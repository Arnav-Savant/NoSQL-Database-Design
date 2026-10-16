package lsm.compaction;

import java.util.List;
import java.util.Optional;
import lsm.sstable.SSTableReader;

/** Once the table count reaches the trigger, merge the two oldest tables. */
public final class OldestPairStrategy implements CompactionStrategy {
    private final int trigger;

    public OldestPairStrategy(int trigger) {
        this.trigger = trigger;
    }

    // Always merging the two oldest keeps the inputs adjacent in time, so the output's range never
    // overlaps a table it didn't absorb, and newest-first read order stays correct.
    @Override
    public Optional<List<SSTableReader>> selectInputs(List<SSTableReader> tablesOldestFirst) {
        if (tablesOldestFirst.size() < trigger) return Optional.empty();
        return Optional.of(List.of(tablesOldestFirst.get(0), tablesOldestFirst.get(1)));
    }
}
