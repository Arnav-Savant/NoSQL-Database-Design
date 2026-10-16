// MyDatabase: the complete LSM-tree key-value store in one class.
//
// This file shows how the pieces fit together. The building blocks it uses (WriteAheadLog,
// Memtable, SSTable, BloomFilter, SparseIndex, EntryMerger) are assumed to exist; their full,
// runnable implementations live in codebases/java/src/lsm/.

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

public final class MyDatabase implements AutoCloseable {
    private static final long WAL_MAX_BYTES = 4 * 1024 * 1024;
    private static final int MEMTABLE_CAPACITY = 100_000;
    private static final int COMPACTION_TRIGGER = 4;

    private final Path directory;
    private final Memtable memtable = new Memtable(MEMTABLE_CAPACITY, new LruEvictionPolicy());
    private final List<SSTable> tables = new ArrayList<>();   // each has a BloomFilter and a SparseIndex
    private WriteAheadLog wal;

    public MyDatabase(Path directory) {
        this.directory = directory;
        recover();
    }

    // ---------------------------------------------------------------- writes

    public void put(String key, Value value) {
        write(Entry.of(key, value));
    }

    public void delete(String key) {
        write(Entry.tombstone(key));                 // SSTables are immutable, so a delete is a marker
    }

    private void write(Entry entry) {
        wal.appendAndSync(entry);                    // durable first: a crash after this loses nothing
        memtable.putDirty(entry);                    // newest value, never evicted until flushed
        if (wal.sizeBytes() >= WAL_MAX_BYTES || memtable.isFullOfDirtyEntries()) {
            flush();
        }
    }

    // ----------------------------------------------------------------- reads

    public Optional<Value> get(String key) {
        Optional<Entry> cached = memtable.get(key);  // dirty or clean, it is the newest value
        if (cached.isPresent()) {
            return cached.get().isTombstone() ? Optional.empty() : Optional.of(cached.get().value());
        }
        for (SSTable table : newestFirst()) {        // first match wins, so the newest value wins
            if (!table.bloomFilter().mightContain(key)) continue;          // definitely absent: no disk read
            Optional<Entry> found = table.readBlock(table.sparseIndex().locate(key)).find(key);
            if (found.isEmpty()) continue;           // a Bloom filter false positive cost one block read
            memtable.putClean(found.get());          // cache it; clean entries may be evicted
            return found.get().isTombstone() ? Optional.empty() : Optional.of(found.get().value());
        }
        return Optional.empty();
    }

    // ----------------------------------------------------------------- flush

    private void flush() {
        List<Entry> dirty = memtable.dirtyEntriesSortedByKey();
        if (dirty.isEmpty()) return;
        // Blocks + sparse index + Bloom filter + footer, written to a temp file, fsynced, renamed.
        tables.add(SSTable.writeAtomically(directory, wal.sequence(), wal.sequence(), dirty));
        memtable.markAllClean();                     // entries stay in RAM as a cache
        WriteAheadLog flushed = wal;
        wal = WriteAheadLog.create(directory, flushed.sequence() + 1);
        flushed.closeAndDelete();                    // its data is now safely in the SSTable
        compact();
    }

    // ------------------------------------------------------------ compaction

    private void compact() {
        while (tables.size() >= COMPACTION_TRIGGER) {
            List<SSTable> oldestFirst = tables.stream().sorted(Comparator.comparingLong(SSTable::maxSequence)).toList();
            SSTable older = oldestFirst.get(0);
            SSTable newer = oldestFirst.get(1);
            boolean dropTombstones = true;           // the oldest table is in this merge: nothing older can resurrect a key
            List<Entry> merged = EntryMerger.merge(older.readAll(), newer.readAll(), dropTombstones); // newer wins on equal keys
            SSTable output = SSTable.writeAtomically(directory, older.minSequence(), newer.maxSequence(), merged);
            tables.removeAll(List.of(older, newer));
            older.delete();
            newer.delete();
            tables.add(output);
        }
    }

    // -------------------------------------------------------------- recovery

    private void recover() {
        Storage.deleteTemporaryFiles(directory);                 // unfinished flushes or merges
        tables.addAll(SSTable.openAll(directory));               // loads each sparse index and Bloom filter
        Storage.deleteTablesContainedInOthers(directory, tables);// inputs of a merge that already finished
        long flushedUpTo = tables.stream().mapToLong(SSTable::maxSequence).max().orElse(0);
        WriteAheadLog.deleteCoveredBy(directory, flushedUpTo);   // already flushed before the crash

        Optional<WriteAheadLog> unflushed = WriteAheadLog.openLatest(directory);
        unflushed.ifPresent(log -> log.replayUntilChecksumFails().forEach(memtable::putDirty)); // torn tail is truncated
        wal = unflushed.orElseGet(() -> WriteAheadLog.create(directory, flushedUpTo + 1));
    }

    private List<SSTable> newestFirst() {
        return tables.stream().sorted(Comparator.comparingLong(SSTable::maxSequence).reversed()).toList();
    }

    @Override
    public void close() {
        wal.close();
    }

    // ------------------------------------------------------------------ main

    public static void main(String[] args) {
        try (MyDatabase db = new MyDatabase(Path.of("data"))) {
            db.put("iphone11", Value.of(4.8));
            db.put("macbook", Value.of(4.9));
            db.put("macbook", Value.of("Apple"));    // values can change type: no schema
            db.put("airpods", Value.of(true));

            System.out.println(db.get("macbook"));   // Optional["Apple"], served from the memtable
            db.delete("airpods");
            System.out.println(db.get("airpods"));   // Optional.empty, hidden by a tombstone
        }
    }
}
