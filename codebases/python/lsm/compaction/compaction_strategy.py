from collections.abc import Sequence
from typing import Protocol

from lsm.sstable.sstable_reader import SSTableReader


class CompactionStrategy(Protocol):
    """Chooses which tables to merge next."""

    # Receives tables ordered oldest first; returns (older, newer) or None when no merge is due.
    def select_inputs(self, tables_oldest_first: Sequence[SSTableReader]) -> tuple[SSTableReader, SSTableReader] | None: ...
