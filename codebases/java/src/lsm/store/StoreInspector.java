package lsm.store;

/** Read-only view of internal state, for teaching and debugging. */
public interface StoreInspector {
    StoreSnapshot snapshot();
}
