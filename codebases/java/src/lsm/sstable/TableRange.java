package lsm.sstable;

/** The span of WAL sequence numbers whose writes a table holds. */
public record TableRange(long min, long max) {
    // A flushed table covers one WAL (`3-3`); a merged table covers its inputs (`1-3`). Ordering tables
    // by `max` orders them by the age of their data, which a fresh id after a merge would break.
    public TableRange {
        if (min < 1 || max < min) throw new IllegalArgumentException("Invalid table range " + min + "-" + max + ".");
    }

    public boolean strictlyContains(TableRange other) {
        boolean covers = min <= other.min && other.max <= max;
        return covers && !(min == other.min && max == other.max);
    }
}
