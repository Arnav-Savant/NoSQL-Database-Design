package lsm.store;

import java.util.List;
import lsm.memtable.EntryState;
import lsm.sstable.BlockHandle;

/** The active WAL, the memtable rows and every SSTable (newest first) at one moment. */
public record StoreSnapshot(ActiveWal activeWal, MemtableView memtable, List<TableView> tables) {
    public StoreSnapshot {
        tables = List.copyOf(tables);
    }

    /** The WAL currently receiving writes. */
    public record ActiveWal(String name, long sizeBytes, int records) {
    }

    /** The memtable's capacity and its rows sorted by key. */
    public record MemtableView(int capacity, List<MemtableRow> rows) {
        public MemtableView {
            rows = List.copyOf(rows);
        }
    }

    /** One memtable entry with its displayed value and state. */
    public record MemtableRow(String key, String value, EntryState state) {
    }

    /** One SSTable's name, sequence range, blocks and Bloom filter statistics. */
    public record TableView(String name, long minSequence, long maxSequence, int entryCount,
            List<BlockHandle> blocks, BloomView bloom) {
        public TableView {
            blocks = List.copyOf(blocks);
        }
    }

    /** Size of a Bloom filter, its hash count and how many of its bits are set. */
    public record BloomView(int bitCount, int hashCount, int setBits) {
    }
}
