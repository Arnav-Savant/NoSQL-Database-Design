package lsm.memtable;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lsm.entry.Entry;
import lsm.entry.KeyOrder;
import lsm.logging.Logger;
import lsm.memtable.eviction.EvictionPolicy;

/** In-memory table holding recently written keys (dirty) and a cache of recently read keys (clean). */
public final class Memtable {
    private final Map<String, MemtableSlot> slots = new LinkedHashMap<>();
    private final int capacity;
    private final EvictionPolicy evictionPolicy;
    private final Logger logger;

    public Memtable(int capacity, EvictionPolicy evictionPolicy, Logger logger) {
        this.capacity = capacity;
        this.evictionPolicy = evictionPolicy;
        this.logger = logger;
    }

    public int capacity() {
        return capacity;
    }

    public int size() {
        return slots.size();
    }

    public int dirtyCount() {
        int count = 0;
        for (MemtableSlot slot : slots.values()) if (slot.state() == EntryState.DIRTY) count++;
        return count;
    }

    public Optional<MemtableSlot> get(String key) {
        MemtableSlot slot = slots.get(key);
        if (slot != null) evictionPolicy.recordAccess(key);
        return Optional.ofNullable(slot);
    }

    public void putDirty(Entry entry) {
        boolean isNewKey = !slots.containsKey(entry.key());
        if (isNewKey && slots.size() >= capacity) evictOneCleanEntry();
        // A dirty entry is stored even past capacity; the store then flushes, which frees room.
        slots.put(entry.key(), new MemtableSlot(entry, EntryState.DIRTY));
        if (isNewKey) evictionPolicy.recordInsert(entry.key());
        else evictionPolicy.recordAccess(entry.key());
        logger.debug("Memtable", "stored", "key", entry.key(), "value", entry.value().display(),
                "state", EntryState.DIRTY, "slots", occupancy());
    }

    public void putClean(Entry entry) {
        // Anything already here is at least as new as what was read from disk.
        if (slots.containsKey(entry.key())) return;
        if (slots.size() >= capacity && !evictOneCleanEntry()) {
            logger.debug("Memtable", "not cached, every slot is dirty", "key", entry.key(), "slots", occupancy());
            return;
        }
        slots.put(entry.key(), new MemtableSlot(entry, EntryState.CLEAN));
        evictionPolicy.recordInsert(entry.key());
        logger.debug("Memtable", "stored", "key", entry.key(), "value", entry.value().display(),
                "state", EntryState.CLEAN, "slots", occupancy());
    }

    public boolean isSaturatedWithDirty() {
        return dirtyCount() >= capacity;
    }

    public List<Entry> dirtyEntriesSortedByKey() {
        return slots.values().stream()
                .filter(slot -> slot.state() == EntryState.DIRTY)
                .map(MemtableSlot::entry)
                .sorted(Comparator.comparing(Entry::key, KeyOrder.COMPARATOR))
                .toList();
    }

    // After a flush the entries stay in memory as a cache; only their state changes.
    public void markAllClean() {
        for (MemtableSlot slot : slots.values()) slot.markClean();
    }

    // Copies of every slot sorted by key, so later state changes don't alter what the caller holds.
    public List<MemtableSlot> rows() {
        return slots.values().stream()
                .sorted(Comparator.comparing((MemtableSlot slot) -> slot.entry().key(), KeyOrder.COMPARATOR))
                .map(slot -> new MemtableSlot(slot.entry(), slot.state()))
                .toList();
    }

    // NOTE: only clean entries may be evicted. A dirty entry's newest value exists nowhere else
    // except the WAL, so dropping it would make reads return an older value from disk.
    private boolean evictOneCleanEntry() {
        Optional<String> victim = evictionPolicy.selectVictim(key -> {
            MemtableSlot slot = slots.get(key);
            return slot != null && slot.state() == EntryState.CLEAN;
        });
        if (victim.isEmpty()) return false;
        String key = victim.get();
        slots.remove(key);
        evictionPolicy.recordRemoval(key);
        logger.debug("Eviction", "evicted clean entry", "key", key, "policy", evictionPolicy.name(), "dirtyKept", dirtyCount());
        return true;
    }

    private String occupancy() {
        return slots.size() + "/" + capacity;
    }
}
