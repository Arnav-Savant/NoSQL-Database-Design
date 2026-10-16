package lsm.sstable;

/** Where one data block starts, how long it is, and the first key it holds. */
public record BlockHandle(String firstKey, long offset, int length) {
}
