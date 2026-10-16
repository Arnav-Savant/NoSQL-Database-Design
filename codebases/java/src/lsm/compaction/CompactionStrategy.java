package lsm.compaction;

import java.util.List;
import java.util.Optional;
import lsm.sstable.SSTableReader;

/** Chooses which tables to merge next. */
public interface CompactionStrategy {
    // Receives tables ordered oldest first; returns [older, newer] or empty when no merge is due.
    Optional<List<SSTableReader>> selectInputs(List<SSTableReader> tablesOldestFirst);
}
