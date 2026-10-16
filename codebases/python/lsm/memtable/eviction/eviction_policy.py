from collections.abc import Callable
from typing import Protocol


class EvictionPolicy(Protocol):
    """Decides which memtable key to drop when room is needed."""

    @property
    def name(self) -> str: ...

    def record_insert(self, key: str) -> None: ...

    def record_access(self, key: str) -> None: ...

    def record_removal(self, key: str) -> None: ...

    # Returns the key to evict among those `is_evictable` accepts, or None if none qualifies.
    def select_victim(self, is_evictable: Callable[[str], bool]) -> str | None: ...
