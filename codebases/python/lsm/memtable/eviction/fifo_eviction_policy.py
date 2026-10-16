from collections.abc import Callable

from lsm.memtable.eviction.eviction_policy import EvictionPolicy


class FifoEvictionPolicy(EvictionPolicy):
    """First in, first out: the key inserted earliest goes first, regardless of use."""

    def __init__(self) -> None:
        # A dict keeps insertion order, and re-assigning an existing key does not move it.
        self._arrivals: dict[str, None] = {}

    @property
    def name(self) -> str:
        return "fifo"

    def record_insert(self, key: str) -> None:
        self._arrivals.setdefault(key, None)

    def record_access(self, key: str) -> None:
        self.record_insert(key)

    def record_removal(self, key: str) -> None:
        self._arrivals.pop(key, None)

    def select_victim(self, is_evictable: Callable[[str], bool]) -> str | None:
        return next((key for key in self._arrivals if is_evictable(key)), None)
