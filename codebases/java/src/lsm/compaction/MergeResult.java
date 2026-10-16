package lsm.compaction;

import java.util.List;
import lsm.entry.Entry;

/** The merged entries and how many duplicates and tombstones the merge dropped. */
public record MergeResult(List<Entry> entries, int duplicatesDropped, int tombstonesDropped) {
    public MergeResult {
        entries = List.copyOf(entries);
    }
}
