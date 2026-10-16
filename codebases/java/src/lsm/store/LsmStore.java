package lsm.store;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import lsm.compaction.Compactor;
import lsm.config.StoreConfig;
import lsm.entry.Entry;
import lsm.entry.Value;
import lsm.io.StorageDirectory;
import lsm.logging.Logger;
import lsm.memtable.Memtable;
import lsm.memtable.MemtableSlot;
import lsm.recovery.RecoveredState;
import lsm.recovery.RecoveryManager;
import lsm.sstable.SSTableReader;
import lsm.sstable.SSTableReaderFactory;
import lsm.sstable.SSTableWriter;
import lsm.sstable.TableRange;
import lsm.wal.WalWriter;
import lsm.wal.WalWriterFactory;

/** A log-structured merge tree key-value store. */
public final class LsmStore implements KeyValueReader, KeyValueWriter, Lifecycle, StoreInspector {
    private static final Comparator<SSTableReader> NEWEST_FIRST =
            Comparator.comparingLong((SSTableReader table) -> table.range().max()).reversed();

    private final StoreConfig config;
    private final StorageDirectory directory;
    private final Logger logger;
    private final Memtable memtable;
    private final WalWriterFactory walFactory;
    private final SSTableWriter tableWriter;
    private final SSTableReaderFactory tableReaderFactory;
    private final Compactor compactor;
    private final RecoveryManager recoveryManager;

    private WalWriter wal = null;
    private List<SSTableReader> tables = new ArrayList<>();
    private List<String> unflushedWalNames = new ArrayList<>();
    private long oldestUnflushedSequence = 0;

    public LsmStore(StoreConfig config, StorageDirectory directory, Logger logger, Memtable memtable,
            WalWriterFactory walFactory, SSTableWriter tableWriter, SSTableReaderFactory tableReaderFactory,
            Compactor compactor, RecoveryManager recoveryManager) {
        this.config = config;
        this.directory = directory;
        this.logger = logger;
        this.memtable = memtable;
        this.walFactory = walFactory;
        this.tableWriter = tableWriter;
        this.tableReaderFactory = tableReaderFactory;
        this.compactor = compactor;
        this.recoveryManager = recoveryManager;
    }

    @Override
    public void open() {
        directory.ensureExists();
        RecoveredState recovered = recoveryManager.recover();
        List<RecoveredState.ReplayedWal> wals = recovered.wals();
        tables = new ArrayList<>(recovered.tables());

        for (RecoveredState.ReplayedWal replayed : wals) for (Entry entry : replayed.entries()) memtable.putDirty(entry);

        long highestTableSequence = 0;
        for (SSTableReader table : tables) highestTableSequence = Math.max(highestTableSequence, table.range().max());
        long activeSequence = wals.isEmpty() ? highestTableSequence + 1 : wals.get(wals.size() - 1).sequence();
        wal = walFactory.open(activeSequence);
        unflushedWalNames = new ArrayList<>();
        if (wals.isEmpty()) unflushedWalNames.add(wal.name());
        else for (RecoveredState.ReplayedWal replayed : wals) unflushedWalNames.add(replayed.name());
        oldestUnflushedSequence = wals.isEmpty() ? activeSequence : wals.get(0).sequence();

        logger.info("Store", "opened",
                "tables", tables.size(),
                "activeWal", wal.name(),
                "recoveredEntries", memtable.size());
        // Several unflushed WALs mean a crash interrupted a flush; fold them into one table now.
        if (wals.size() > 1 || flushIsDue()) flush("recovery");
    }

    @Override
    public void close() {
        if (wal != null) wal.close();
        wal = null;
        logger.info("Store", "closed");
    }

    @Override
    public void put(String key, Value value) {
        write(Entry.of(key, value));
    }

    @Override
    public void delete(String key) {
        write(Entry.tombstone(key));
    }

    @Override
    public Optional<Value> get(String key) {
        Optional<MemtableSlot> cached = memtable.get(key);
        if (cached.isPresent()) {
            MemtableSlot slot = cached.get();
            logger.debug("Read", "memtable hit", "key", key, "state", slot.state(), "value", slot.entry().value().display());
            return slot.entry().isTombstone() ? Optional.empty() : Optional.of(slot.entry().value());
        }
        logger.debug("Read", "memtable miss, checking tables newest first", "key", key, "tables", tables.size());

        for (SSTableReader table : tablesNewestFirst()) {
            if (!table.mightContain(key)) {
                logger.debug("Read", "bloom filter says definitely absent, table skipped", "key", key, "table", table.name());
                continue;
            }
            Optional<Entry> found = table.find(key);
            if (found.isEmpty()) {
                logger.debug("Read", "bloom filter false positive, key not in block", "key", key, "table", table.name());
                continue;
            }
            Entry entry = found.get();
            logger.debug("Read", "found on disk", "key", key, "table", table.name(), "value", entry.value().display());
            memtable.putClean(entry);
            return entry.isTombstone() ? Optional.empty() : Optional.of(entry.value());
        }
        logger.debug("Read", "not found in any table", "key", key);
        return Optional.empty();
    }

    @Override
    public StoreSnapshot snapshot() {
        List<StoreSnapshot.MemtableRow> rows = memtable.rows().stream()
                .map(slot -> new StoreSnapshot.MemtableRow(slot.entry().key(), slot.entry().value().display(), slot.state()))
                .toList();
        return new StoreSnapshot(
                new StoreSnapshot.ActiveWal(wal.name(), wal.sizeBytes(), wal.recordCount()),
                new StoreSnapshot.MemtableView(memtable.capacity(), rows),
                tablesNewestFirst().stream().map(LsmStore::describe).toList());
    }

    private void write(Entry entry) {
        // Durable first: once the WAL append returns, a crash can no longer lose this write.
        wal.append(entry);
        memtable.putDirty(entry);
        if (flushIsDue()) {
            flush(memtable.isSaturatedWithDirty() ? "memtable full of dirty entries" : "WAL reached its size limit");
        }
    }

    private boolean flushIsDue() {
        return wal.sizeBytes() >= config.walMaxBytes() || memtable.isSaturatedWithDirty();
    }

    private void flush(String reason) {
        List<Entry> entries = memtable.dirtyEntriesSortedByKey();
        if (entries.isEmpty()) return;
        logger.info("Flush", "started", "reason", reason, "dirtyEntries", entries.size());

        TableRange range = new TableRange(oldestUnflushedSequence, wal.sequence());
        String tableName = tableWriter.write(range, entries);
        tables.add(tableReaderFactory.open(tableName));
        memtable.markAllClean();

        // Only now that the table is durable can the WALs it replaces be deleted.
        long nextSequence = wal.sequence() + 1;
        wal.close();
        for (String walName : unflushedWalNames) {
            directory.remove(walName);
            logger.info("Wal", "deleted, its entries are in the new table", "wal", walName);
        }
        wal = walFactory.open(nextSequence);
        unflushedWalNames = new ArrayList<>(List.of(wal.name()));
        oldestUnflushedSequence = nextSequence;
        logger.info("Flush", "finished", "table", tableName, "cleanEntries", memtable.size());

        tables = new ArrayList<>(compactor.compactUntilStable(tables));
    }

    private List<SSTableReader> tablesNewestFirst() {
        List<SSTableReader> sorted = new ArrayList<>(tables);
        sorted.sort(NEWEST_FIRST);
        return sorted;
    }

    private static StoreSnapshot.TableView describe(SSTableReader table) {
        return new StoreSnapshot.TableView(
                table.name(),
                table.range().min(),
                table.range().max(),
                table.entryCount(),
                table.sparseIndex().blocks(),
                new StoreSnapshot.BloomView(table.bloom().bitCount(), table.bloom().hashCount(), table.bloom().setBitCount()));
    }
}
