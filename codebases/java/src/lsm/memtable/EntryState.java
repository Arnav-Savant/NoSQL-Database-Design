package lsm.memtable;

/** Written since the last flush (only in the WAL), or already saved in an SSTable. */
public enum EntryState {
    DIRTY("dirty"),
    CLEAN("clean");

    private final String label;

    EntryState(String label) {
        this.label = label;
    }

    @Override
    public String toString() {
        return label;
    }
}
