from dataclasses import dataclass
from enum import StrEnum

from lsm.entry.entry import Entry
from lsm.entry.key_order import key_bytes
from lsm.logging.logger import Logger
from lsm.memtable.eviction.eviction_policy import EvictionPolicy


class EntryState(StrEnum):
    """Written since the last flush (only in the WAL), or already saved in an SSTable."""

    DIRTY = "dirty"
    CLEAN = "clean"


@dataclass
class MemtableSlot:
    """One memtable entry together with its state."""

    entry: Entry
    state: EntryState


class Memtable:
    """In-memory table of recently written keys (dirty) and a cache of recently read keys (clean)."""

    def __init__(self, capacity: int, eviction_policy: EvictionPolicy, logger: Logger) -> None:
        self._slots: dict[str, MemtableSlot] = {}
        self._capacity = capacity
        self._eviction_policy = eviction_policy
        self._logger = logger

    @property
    def capacity(self) -> int:
        return self._capacity

    @property
    def size(self) -> int:
        return len(self._slots)

    @property
    def dirty_count(self) -> int:
        return sum(1 for slot in self._slots.values() if slot.state == EntryState.DIRTY)

    def get(self, key: str) -> MemtableSlot | None:
        slot = self._slots.get(key)
        if slot is not None:
            self._eviction_policy.record_access(key)
        return slot

    def put_dirty(self, entry: Entry) -> None:
        is_new_key = entry.key not in self._slots
        if is_new_key and len(self._slots) >= self._capacity:
            self._evict_one_clean_entry()
        # A dirty entry is stored even past capacity; the store then flushes, which frees room.
        self._slots[entry.key] = MemtableSlot(entry, EntryState.DIRTY)
        if is_new_key:
            self._eviction_policy.record_insert(entry.key)
        else:
            self._eviction_policy.record_access(entry.key)
        self._logger.debug("Memtable", "stored", {"key": entry.key, "value": entry.value.display, "state": EntryState.DIRTY, "slots": self._occupancy()})

    def put_clean(self, entry: Entry) -> None:
        # Anything already here is at least as new as what was read from disk.
        if entry.key in self._slots:
            return
        if len(self._slots) >= self._capacity and not self._evict_one_clean_entry():
            self._logger.debug("Memtable", "not cached, every slot is dirty", {"key": entry.key, "slots": self._occupancy()})
            return
        self._slots[entry.key] = MemtableSlot(entry, EntryState.CLEAN)
        self._eviction_policy.record_insert(entry.key)
        self._logger.debug("Memtable", "stored", {"key": entry.key, "value": entry.value.display, "state": EntryState.CLEAN, "slots": self._occupancy()})

    def is_saturated_with_dirty(self) -> bool:
        return self.dirty_count >= self._capacity

    def dirty_entries_sorted_by_key(self) -> list[Entry]:
        dirty = [slot.entry for slot in self._slots.values() if slot.state == EntryState.DIRTY]
        return sorted(dirty, key=lambda entry: key_bytes(entry.key))

    # After a flush the entries stay in memory as a cache; only their state changes.
    def mark_all_clean(self) -> None:
        for slot in self._slots.values():
            slot.state = EntryState.CLEAN

    def rows(self) -> list[dict[str, str]]:
        return [
            {"key": key, "value": self._slots[key].entry.value.display, "state": str(self._slots[key].state)}
            for key in sorted(self._slots, key=key_bytes)
        ]

    # NOTE: only clean entries may be evicted. A dirty entry's newest value exists nowhere else
    # except the WAL, so dropping it would make reads return an older value from disk.
    def _evict_one_clean_entry(self) -> bool:
        victim = self._eviction_policy.select_victim(self._is_clean)
        if victim is None:
            return False
        del self._slots[victim]
        self._eviction_policy.record_removal(victim)
        self._logger.debug("Eviction", "evicted clean entry", {"key": victim, "policy": self._eviction_policy.name, "dirtyKept": self.dirty_count})
        return True

    def _is_clean(self, key: str) -> bool:
        slot = self._slots.get(key)
        return slot is not None and slot.state == EntryState.CLEAN

    def _occupancy(self) -> str:
        return f"{len(self._slots)}/{self._capacity}"
