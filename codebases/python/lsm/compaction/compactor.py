from collections.abc import Iterable

from lsm.compaction.compaction_strategy import CompactionStrategy
from lsm.compaction.entry_merger import EntryMerger
from lsm.io.storage_directory import StorageDirectory
from lsm.logging.logger import Logger
from lsm.sstable.sstable_reader import SSTableReader
from lsm.sstable.sstable_reader_factory import SSTableReaderFactory
from lsm.sstable.sstable_writer import SSTableWriter
from lsm.sstable.table_range import TableRange


class Compactor:
    """Merges tables chosen by the strategy until no merge is due."""

    def __init__(
        self,
        strategy: CompactionStrategy,
        merger: EntryMerger,
        writer: SSTableWriter,
        reader_factory: SSTableReaderFactory,
        directory: StorageDirectory,
        logger: Logger,
    ) -> None:
        self._strategy = strategy
        self._merger = merger
        self._writer = writer
        self._reader_factory = reader_factory
        self._directory = directory
        self._logger = logger

    # Returns the new set of live tables, oldest first.
    def compact_until_stable(self, tables: Iterable[SSTableReader]) -> list[SSTableReader]:
        live = _sort_oldest_first(tables)
        while (inputs := self._strategy.select_inputs(live)) is not None:
            older, newer = inputs
            output = self._merge(older, newer, live)
            survivors = [table for table in live if table is not older and table is not newer]
            live = _sort_oldest_first(survivors + ([output] if output is not None else []))
        return live

    def _merge(self, older: SSTableReader, newer: SSTableReader, live: list[SSTableReader]) -> SSTableReader | None:
        # NOTE: a tombstone may only be dropped when no table older than this merge could still hold
        # the key; otherwise the deleted value would reappear from that older table.
        drop_tombstones = all(table.range.min >= older.range.min for table in live)
        self._logger.info("Compaction", "merging", {"older": older.name, "newer": newer.name, "dropTombstones": drop_tombstones})

        # NOTE: both tables are loaded whole because they are small here. Real compactors stream
        # through the inputs one entry at a time, so memory use doesn't grow with table size.
        result = self._merger.merge(older.read_all_entries(), newer.read_all_entries(), drop_tombstones)
        table_range = TableRange(older.range.min, newer.range.max)
        output_name = self._writer.write(table_range, result.entries) if result.entries else None

        # The output is fully on disk before the inputs disappear. A crash in between leaves inputs
        # whose ranges sit inside the output's range, which recovery recognises and removes.
        self._directory.remove(older.name)
        self._directory.remove(newer.name)
        self._logger.info("Compaction", "merged", {
            "output": output_name if output_name is not None else "none",
            "kept": len(result.entries),
            "duplicatesDropped": result.duplicates_dropped,
            "tombstonesDropped": result.tombstones_dropped,
        })
        return self._reader_factory.open(output_name) if output_name is not None else None


def _sort_oldest_first(tables: Iterable[SSTableReader]) -> list[SSTableReader]:
    return sorted(tables, key=lambda table: table.range.max)
