package lsm.recovery;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;
import lsm.io.FileNames;
import lsm.io.StorageDirectory;
import lsm.logging.Logger;
import lsm.sstable.SSTableReader;
import lsm.sstable.SSTableReaderFactory;
import lsm.sstable.TableRange;
import lsm.wal.WalReader;
import lsm.wal.WalReplay;

/** Brings the data directory back to a consistent state after a clean shutdown or a crash. */
public final class RecoveryManager {
    private final StorageDirectory directory;
    private final SSTableReaderFactory readerFactory;
    private final Logger logger;

    public RecoveryManager(StorageDirectory directory, SSTableReaderFactory readerFactory, Logger logger) {
        this.directory = directory;
        this.readerFactory = readerFactory;
        this.logger = logger;
    }

    // Returns the live tables (oldest first) and the replayed, not-yet-flushed WALs (oldest first).
    public RecoveredState recover() {
        removeTemporaryFiles();
        List<SSTableReader> tables = openTables(removeSupersededTables());
        long highestFlushedSequence = 0;
        for (SSTableReader table : tables) highestFlushedSequence = Math.max(highestFlushedSequence, table.range().max());
        List<RecoveredState.ReplayedWal> wals = replayUnflushedWals(highestFlushedSequence);
        return new RecoveredState(tables, wals);
    }

    // A *.tmp file is a flush or merge that never reached its rename; its source data still exists.
    private void removeTemporaryFiles() {
        for (String name : directory.list()) {
            if (!FileNames.isTempFileName(name)) continue;
            directory.remove(name);
            logger.warn("Recovery", "removed unfinished temporary file", "file", name);
        }
    }

    // A table whose range lies inside another's is the input of a merge that finished writing its
    // output but crashed before deleting the inputs. The output already holds all of its data.
    private List<NamedTable> removeSupersededTables() {
        List<NamedTable> named = new ArrayList<>();
        for (String name : directory.list()) {
            FileNames.parseTableFileName(name).ifPresent(range -> named.add(new NamedTable(name, range)));
        }
        List<NamedTable> survivors = new ArrayList<>();
        for (NamedTable table : named) {
            Optional<NamedTable> container = named.stream()
                    .filter(other -> other.range().strictlyContains(table.range()))
                    .findFirst();
            if (container.isPresent()) {
                directory.remove(table.name());
                logger.warn("Recovery", "removed table superseded by a finished merge",
                        "table", table.name(), "mergedInto", container.get().name());
            } else {
                survivors.add(table);
            }
        }
        return survivors;
    }

    private List<SSTableReader> openTables(List<NamedTable> namedTables) {
        List<NamedTable> sorted = new ArrayList<>(namedTables);
        sorted.sort(Comparator.comparingLong(table -> table.range().max()));
        List<SSTableReader> tables = new ArrayList<>();
        for (NamedTable table : sorted) tables.add(readerFactory.open(table.name()));
        for (SSTableReader table : tables) {
            logger.info("Recovery", "opened table",
                    "table", table.name(), "entries", table.entryCount(), "blocks", table.sparseIndex().blocks().size());
        }
        return tables;
    }

    private List<RecoveredState.ReplayedWal> replayUnflushedWals(long highestFlushedSequence) {
        List<NamedWal> wals = new ArrayList<>();
        for (String name : directory.list()) {
            OptionalLong sequence = FileNames.parseWalFileName(name);
            if (sequence.isPresent()) wals.add(new NamedWal(name, sequence.getAsLong()));
        }
        wals.sort(Comparator.comparingLong(NamedWal::sequence));

        List<RecoveredState.ReplayedWal> replayed = new ArrayList<>();
        for (NamedWal wal : wals) {
            // Already flushed: the crash happened after its SSTable was written but before it was deleted.
            if (wal.sequence() <= highestFlushedSequence) {
                directory.remove(wal.name());
                logger.info("Recovery", "removed WAL already covered by a table", "wal", wal.name());
                continue;
            }
            WalReplay replay = WalReader.replay(directory, wal.name());
            if (replay.tornBytes() > 0) {
                directory.truncate(wal.name(), replay.lastGoodOffset());
                logger.warn("Recovery", "torn WAL tail truncated",
                        "wal", wal.name(), "keptBytes", replay.lastGoodOffset(), "droppedBytes", replay.tornBytes());
            }
            logger.info("Recovery", "replayed WAL", "wal", wal.name(), "records", replay.entries().size());
            replayed.add(new RecoveredState.ReplayedWal(wal.name(), wal.sequence(), replay.entries()));
        }
        return replayed;
    }

    private record NamedTable(String name, TableRange range) {
    }

    private record NamedWal(String name, long sequence) {
    }
}
