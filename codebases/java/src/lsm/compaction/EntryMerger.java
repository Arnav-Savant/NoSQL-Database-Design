package lsm.compaction;

import java.util.ArrayList;
import java.util.List;
import lsm.entry.Entry;
import lsm.entry.KeyOrder;

/** Two-pointer merge of two sorted entry lists; on equal keys the newer entry wins. */
public final class EntryMerger {
    public MergeResult merge(List<Entry> olderEntries, List<Entry> newerEntries, boolean dropTombstones) {
        Output output = new Output(dropTombstones);
        int duplicatesDropped = 0;

        int older = 0;
        int newer = 0;
        while (older < olderEntries.size() && newer < newerEntries.size()) {
            int order = KeyOrder.compareKeys(olderEntries.get(older).key(), newerEntries.get(newer).key());
            if (order < 0) output.emit(olderEntries.get(older++));
            else if (order > 0) output.emit(newerEntries.get(newer++));
            else {
                output.emit(newerEntries.get(newer++));
                older++;
                duplicatesDropped++;
            }
        }
        while (older < olderEntries.size()) output.emit(olderEntries.get(older++));
        while (newer < newerEntries.size()) output.emit(newerEntries.get(newer++));

        return new MergeResult(output.entries, duplicatesDropped, output.tombstonesDropped);
    }

    // Collects the merged entries, dropping tombstones when the merge is allowed to.
    private static final class Output {
        private final boolean dropTombstones;
        private final List<Entry> entries = new ArrayList<>();
        private int tombstonesDropped = 0;

        Output(boolean dropTombstones) {
            this.dropTombstones = dropTombstones;
        }

        void emit(Entry entry) {
            if (dropTombstones && entry.isTombstone()) tombstonesDropped++;
            else entries.add(entry);
        }
    }
}
