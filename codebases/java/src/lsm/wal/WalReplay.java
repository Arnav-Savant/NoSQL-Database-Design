package lsm.wal;

import java.util.List;
import lsm.entry.Entry;

/** The intact entries of one WAL, where the last valid record ends, and how many bytes follow it. */
public record WalReplay(List<Entry> entries, long lastGoodOffset, long tornBytes) {
    public WalReplay {
        entries = List.copyOf(entries);
    }
}
