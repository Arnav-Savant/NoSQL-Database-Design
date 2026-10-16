from collections import OrderedDict
from collections.abc import Callable

from lsm.memtable.eviction.eviction_policy import EvictionPolicy


class LruEvictionPolicy(EvictionPolicy):
    """Least recently used: the key untouched for the longest time goes first."""

    def __init__(self) -> None:
        # An OrderedDict iterates in insertion order; moving a key to the end on access keeps the
        # oldest use at the front.
        self._recency: OrderedDict[str, None] = OrderedDict()

    @property
    def name(self) -> str:
        return "lru"

    def record_insert(self, key: str) -> None:
        self.record_access(key)

    def record_access(self, key: str) -> None:
        self._recency[key] = None
        self._recency.move_to_end(key)

    def record_removal(self, key: str) -> None:
        self._recency.pop(key, None)

    def select_victim(self, is_evictable: Callable[[str], bool]) -> str | None:
        return next((key for key in self._recency if is_evictable(key)), None)
