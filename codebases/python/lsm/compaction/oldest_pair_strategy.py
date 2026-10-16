from collections.abc import Sequence

from lsm.compaction.compaction_strategy import CompactionStrategy
from lsm.sstable.sstable_reader import SSTableReader


class OldestPairStrategy(CompactionStrategy):
    """Once the table count reaches the trigger, merge the two oldest tables."""

    def __init__(self, trigger: int) -> None:
        self._trigger = trigger

    # Always merging the two oldest keeps the inputs adjacent in time, so the output's range never
    # overlaps a table it didn't absorb, and newest-first read order stays correct.
    def select_inputs(self, tables_oldest_first: Sequence[SSTableReader]) -> tuple[SSTableReader, SSTableReader] | None:
        if len(tables_oldest_first) < self._trigger:
            return None
        return tables_oldest_first[0], tables_oldest_first[1]
