from collections.abc import Callable

from lsm.memtable.eviction.eviction_policy import EvictionPolicy


class LfuEvictionPolicy(EvictionPolicy):
    """Least frequently used: the key with the fewest uses goes first; ties go to the oldest insert."""

    def __init__(self) -> None:
        self._use_counts: dict[str, int] = {}
        self._insert_order: dict[str, int] = {}
        self._next_insert = 0

    @property
    def name(self) -> str:
        return "lfu"

    def record_insert(self, key: str) -> None:
        self._use_counts[key] = 1
        self._insert_order[key] = self._next_insert
        self._next_insert += 1

    def record_access(self, key: str) -> None:
        if key not in self._use_counts:
            self.record_insert(key)
            return
        self._use_counts[key] += 1

    def record_removal(self, key: str) -> None:
        self._use_counts.pop(key, None)
        self._insert_order.pop(key, None)

    def select_victim(self, is_evictable: Callable[[str], bool]) -> str | None:
        victim: str | None = None
        for key, uses in self._use_counts.items():
            if not is_evictable(key):
                continue
            fewer_uses = victim is None or uses < self._use_counts[victim]
            older_tie = (
                victim is not None
                and uses == self._use_counts[victim]
                and self._insert_order[key] < self._insert_order[victim]
            )
            if fewer_uses or older_tie:
                victim = key
        return victim
