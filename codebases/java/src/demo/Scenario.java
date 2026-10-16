package demo;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;
import lsm.entry.Value;
import lsm.store.LsmStore;

/** The ten-chapter walkthrough shared by every language's demo. */
public final class Scenario {
    // An absent key whose bits all happen to be set in a table's Bloom filter at chapter 7.
    public static final String FALSE_POSITIVE_PROBE = "probe-069";
    public static final String ABSENT_KEY = "nokia";

    private final Supplier<LsmStore> openStore;
    private final Narrator narrator;
    private final StatePrinter printer;
    private final Path dataDirectory;
    private LsmStore store = null;

    public Scenario(Supplier<LsmStore> openStore, Narrator narrator, StatePrinter printer, Path dataDirectory) {
        this.openStore = openStore;
        this.narrator = narrator;
        this.printer = printer;
        this.dataDirectory = dataDirectory;
    }

    public void run() {
        openingAnEmptyStore();
        firstWrites();
        valuesWithoutASchema();
        insideTheFirstSSTable();
        readsServedFromMemory();
        fillingTheCache();
        readsThatReachTheDisk();
        deletingAKey();
        compaction();
        crashAndRecovery();
        summary();
    }

    private void openingAnEmptyStore() {
        narrator.chapter("1", "Opening an empty store", List.of(
                "The store keeps everything in one data directory. Opening it first runs recovery, which finds nothing to recover in an empty directory, and then creates the first write-ahead log (WAL): an append-only file that every write reaches before anything else happens.",
                "Writing to the WAL first is what makes the store durable. Once a write is in the WAL and forced to disk, a crash can no longer lose it."));
        store = openStore.get();
        printer.printSnapshot(store.snapshot());
    }

    private void firstWrites() {
        narrator.chapter("2", "First writes", List.of(
                "Each put does two things: it appends a record to the WAL and forces it to disk, then stores the key in the memtable, an in-memory table of recent writes. The memtable entry is marked dirty, meaning its newest value so far exists only in the WAL."));
        put("iphone11", 4.8);
        put("iphone12", 4.7);
        put("macbook", 4.9);

        narrator.explain(List.of(
                "Here is the first WAL record, byte by byte. The checksum lets recovery detect a record that was only partly written when a crash happened; the length says where the next record starts."));
        byte[] walBytes = readFile(dataDirectory.resolve(store.snapshot().activeWal().name()));
        int recordLength = 8 + ByteBuffer.wrap(walBytes).getInt(4);
        printer.printWalRecord(Arrays.copyOfRange(walBytes, 0, recordLength));
        printer.printSnapshot(store.snapshot());
    }

    private void valuesWithoutASchema() {
        narrator.chapter("3", "Values without a schema", List.of(
                "Values carry their own type, so a key can switch from a number to a string. The update is appended to the WAL as a second macbook record; the first one is left untouched. The memtable, being a map, keeps only the newest value."));
        put("macbook", "Apple");
        printer.printSnapshot(store.snapshot());

        narrator.explain(List.of(
                "The next write pushes the WAL past its size limit, so the store flushes: it sorts the dirty entries by key, writes them to a new SSTable (a sorted, immutable file), marks them clean, starts a new WAL and deletes the old one. Clean entries stay in memory as a cache."));
        put("ipad", 4.6);
        printer.printSnapshot(store.snapshot());
    }

    private void insideTheFirstSSTable() {
        narrator.chapter("4", "Inside the first SSTable", List.of(
                "The table holds one entry per key, sorted by the bytes of the key, which is why ipad comes before iphone11. The stale macbook = 4.9 never reached it: only the memtable's newest value was written.",
                "Entries are packed into blocks of at most 64 bytes. The sparse index stores the first key and offset of each block, so a lookup reads exactly one block. The Bloom filter is a small bit array that can prove a key is absent without reading the disk at all."));
        printer.printSnapshot(store.snapshot());
    }

    private void readsServedFromMemory() {
        narrator.chapter("5", "Reads served from memory", List.of(
                "A read checks the memtable first. Both keys are there as clean entries, so they are answered from memory with no disk access. Anything in the memtable is the newest value, because every write passes through it."));
        get("macbook");
        get("iphone11");
    }

    private void fillingTheCache() {
        narrator.chapter("6", "Filling the cache", List.of(
                "The memtable has room for 6 entries. When a new key arrives and it is full, the eviction policy (least recently used here) removes a clean entry, one already saved in an SSTable. Dirty entries are never evicted: their newest value exists only in the WAL, so dropping them would make reads return stale data.",
                "Watch the eviction lines below, and the second flush when the WAL fills up again."));
        put("airpods", 4.5);
        put("watch", 4.4);
        put("pixel8", 4.3);
        put("galaxy", 4.2);
        put("kindle", 4.1);
        put("iphone12", 4.9);
        put("airpods", true);
        put("ipad", "M4");
        put("macbook", "M4 Pro");
        printer.printSnapshot(store.snapshot());
    }

    private void readsThatReachTheDisk() {
        narrator.chapter("7", "Reads that reach the disk", List.of(
                "watch was evicted from the memtable, so its read goes to disk. Tables are checked newest first, and the first match wins, which guarantees the newest value. For each table the Bloom filter is asked first; only on a \"maybe\" does the sparse index pick one block to read. A value found on disk is cached as a clean entry."));
        get("watch");

        narrator.explain(List.of(
                ABSENT_KEY + " was never written. Every table's Bloom filter rules it out, so the read finishes without touching the disk."));
        get(ABSENT_KEY);

        narrator.explain(List.of(
                FALSE_POSITIVE_PROBE + " was never written either, but in one table all of its Bloom filter bits happen to be set by other keys. That \"maybe\" is a false positive: it costs one block read before the read moves on."));
        get(FALSE_POSITIVE_PROBE);
    }

    private void deletingAKey() {
        narrator.chapter("8", "Deleting a key", List.of(
                "SSTables are immutable, so a delete can't remove watch from the table that holds it. Instead it writes a tombstone: an entry that means \"deleted\". The read finds the tombstone in the memtable first and reports the key as absent, so the older value on disk is never consulted."));
        delete("watch");
        get("watch");
        printer.printSnapshot(store.snapshot());
    }

    private void compaction() {
        narrator.chapter("9", "Compaction", List.of(
                "Every flush adds a table, and the same key can live in several of them. When the table count reaches 3, the compactor merges the two oldest tables like merge sort: two pointers walk both sorted tables, and on equal keys the newer entry wins. The output is named by the range of WAL numbers it covers, so it still sorts as older than the tables it didn't absorb.",
                "A tombstone may be dropped only when the merge includes the oldest table, because then no older copy of the key can exist anywhere. The next write triggers a flush and the first merge."));
        put("pixel8", 4.4);

        narrator.explain(List.of(
                "Five more writes fill the WAL again. This time the merge includes the table holding the watch tombstone together with the oldest data, so both the old watch = 4.4 and its tombstone disappear for good."));
        put("kindle", "Paperwhite");
        put("galaxy", false);
        put("iphone11", 4.7);
        put("airpods", 4.6);
        put("ipad", 4.5);
        printer.printSnapshot(store.snapshot());
        get("watch");
    }

    private void crashAndRecovery() {
        narrator.chapter("10", "Crash and recovery", List.of(
                "Two more writes, then the process \"crashes\": the store is abandoned without being closed, and 5 bytes of a half-written record are appended to the WAL, as if power failed in the middle of a write."));
        put("galaxy", 4.3);
        put("kindle", 4.2);
        String walName = store.snapshot().activeWal().name();
        appendToFile(dataDirectory.resolve(walName), new byte[] {0x00, 0x00, 0x00, 0x2a, 0x00});
        store = null;

        narrator.explain(List.of(
                "A new store opens the same directory. Recovery removes unfinished temporary files, opens the tables, and replays the WAL. The torn record fails its checksum check, so the WAL is truncated just before it; that write was never acknowledged, so nothing promised is lost. The memtable comes back with only the dirty entries; the cache refills as keys are read."));
        store = openStore.get();
        printer.printSnapshot(store.snapshot());
        get("galaxy");
        get("macbook");
        get("watch");
    }

    private void summary() {
        narrator.chapter("—", "Summary", List.of(
                "Fast writes: every write is one sequential WAL append plus one memory update; sorting, flushing and merging happen later, in bulk.",
                "Fast reads: recent and popular keys come from the memtable; otherwise each table costs a Bloom filter check in memory and at most one block read.",
                "Durability: the WAL is forced to disk before a write returns, tables are published by atomic rename, and recovery repairs torn writes.",
                "Unstructured values: every value carries its own type and length.",
                "Scale: data lives in immutable SSTables that can be copied to and spread across machines, with only a few bits per key and one index entry per block kept in memory."));
        store.close();
    }

    private void put(String key, Object raw) {
        Value value = Value.from(raw);
        narrator.operation("put " + key + " = " + value.display());
        store.put(key, value);
    }

    private void delete(String key) {
        narrator.operation("delete " + key);
        store.delete(key);
    }

    private void get(String key) {
        narrator.operation("get " + key);
        Optional<Value> value = store.get(key);
        narrator.result(value.map(Value::display).orElse("not found"));
    }

    private static byte[] readFile(Path path) {
        try {
            return Files.readAllBytes(path);
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    private static void appendToFile(Path path, byte[] bytes) {
        try {
            Files.write(path, bytes, StandardOpenOption.APPEND);
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }
}
