package lsm.store;

/** Opening (with recovery) and closing. */
public interface Lifecycle {
    void open();

    void close();
}
