package lsm.compaction;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import lsm.io.StorageDirectory;
import lsm.logging.Logger;
import lsm.sstable.SSTableReader;
import lsm.sstable.SSTableReaderFactory;
import lsm.sstable.SSTableWriter;
import lsm.sstable.TableRange;

/** Merges tables chosen by the strategy until no merge is due. */
public final class Compactor {
    private static final Comparator<SSTableReader> OLDEST_FIRST = Comparator.comparingLong(table -> table.range().max());

    private final CompactionStrategy strategy;
    private final EntryMerger merger;
    private final SSTableWriter writer;
    private final SSTableReaderFactory readerFactory;
    private final StorageDirectory directory;
    private final Logger logger;

    public Compactor(CompactionStrategy strategy, EntryMerger merger, SSTableWriter writer,
            SSTableReaderFactory readerFactory, StorageDirectory directory, Logger logger) {
        this.strategy = strategy;
        this.merger = merger;
        this.writer = writer;
        this.readerFactory = readerFactory;
        this.directory = directory;
        this.logger = logger;
    }

    // Returns the new set of live tables, oldest first.
    public List<SSTableReader> compactUntilStable(List<SSTableReader> tables) {
        List<SSTableReader> live = sortOldestFirst(tables);
        for (Optional<List<SSTableReader>> inputs = strategy.selectInputs(live); inputs.isPresent();
                inputs = strategy.selectInputs(live)) {
            SSTableReader older = inputs.get().get(0);
            SSTableReader newer = inputs.get().get(1);
            Optional<SSTableReader> output = merge(older, newer, live);
            List<SSTableReader> next = new ArrayList<>();
            for (SSTableReader table : live) if (table != older && table != newer) next.add(table);
            output.ifPresent(next::add);
            live = sortOldestFirst(next);
        }
        return live;
    }

    private Optional<SSTableReader> merge(SSTableReader older, SSTableReader newer, List<SSTableReader> live) {
        // NOTE: a tombstone may only be dropped when no table older than this merge could still hold
        // the key; otherwise the deleted value would reappear from that older table.
        boolean dropTombstones = live.stream().allMatch(table -> table.range().min() >= older.range().min());
        logger.info("Compaction", "merging", "older", older.name(), "newer", newer.name(), "dropTombstones", dropTombstones);

        // NOTE: both tables are loaded whole because they are small here. Real compactors stream
        // through the inputs one entry at a time, so memory use doesn't grow with table size.
        MergeResult result = merger.merge(older.readAllEntries(), newer.readAllEntries(), dropTombstones);
        TableRange range = new TableRange(older.range().min(), newer.range().max());
        Optional<String> outputName = result.entries().isEmpty()
                ? Optional.empty()
                : Optional.of(writer.write(range, result.entries()));

        // The output is fully on disk before the inputs disappear. A crash in between leaves inputs
        // whose ranges sit inside the output's range, which recovery recognises and removes.
        directory.remove(older.name());
        directory.remove(newer.name());
        logger.info("Compaction", "merged",
                "output", outputName.orElse("none"),
                "kept", result.entries().size(),
                "duplicatesDropped", result.duplicatesDropped(),
                "tombstonesDropped", result.tombstonesDropped());
        return outputName.map(readerFactory::open);
    }

    private static List<SSTableReader> sortOldestFirst(List<SSTableReader> tables) {
        List<SSTableReader> sorted = new ArrayList<>(tables);
        sorted.sort(OLDEST_FIRST);
        return sorted;
    }
}
