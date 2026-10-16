package lsm.recovery;

import java.util.List;
import lsm.entry.Entry;
import lsm.sstable.SSTableReader;

/** The live tables (oldest first) and the replayed, not-yet-flushed WALs (oldest first). */
public record RecoveredState(List<SSTableReader> tables, List<ReplayedWal> wals) {
    public RecoveredState {
        tables = List.copyOf(tables);
        wals = List.copyOf(wals);
    }

    /** One WAL that recovery replayed, with the entries it still holds. */
    public record ReplayedWal(String name, long sequence, List<Entry> entries) {
        public ReplayedWal {
            entries = List.copyOf(entries);
        }
    }
}
