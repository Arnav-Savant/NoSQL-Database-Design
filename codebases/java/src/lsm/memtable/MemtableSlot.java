package lsm.memtable;

import lsm.entry.Entry;

/** One memtable entry together with whether it is dirty or clean. */
public final class MemtableSlot {
    private final Entry entry;
    private EntryState state;

    MemtableSlot(Entry entry, EntryState state) {
        this.entry = entry;
        this.state = state;
    }

    public Entry entry() {
        return entry;
    }

    public EntryState state() {
        return state;
    }

    void markClean() {
        state = EntryState.CLEAN;
    }
}
