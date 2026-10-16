from typing import NamedTuple

from lsm.entry.entry import Entry
from lsm.io.file_names import is_temp_file_name, parse_table_file_name, parse_wal_file_name
from lsm.io.storage_directory import StorageDirectory
from lsm.logging.logger import Logger
from lsm.sstable.sstable_reader import SSTableReader
from lsm.sstable.sstable_reader_factory import SSTableReaderFactory
from lsm.sstable.table_range import TableRange
from lsm.wal.wal_reader import WalReader


class RecoveredWal(NamedTuple):
    """A WAL that was replayed because its writes are not in any table yet."""

    name: str
    sequence: int
    entries: list[Entry]


class RecoveryManager:
    """Brings the data directory back to a consistent state after a clean shutdown or a crash."""

    def __init__(self, directory: StorageDirectory, reader_factory: SSTableReaderFactory, logger: Logger) -> None:
        self._directory = directory
        self._reader_factory = reader_factory
        self._logger = logger

    # Returns the live tables (oldest first) and the replayed, not-yet-flushed WALs (oldest first).
    def recover(self) -> tuple[list[SSTableReader], list[RecoveredWal]]:
        self._remove_temporary_files()
        tables = self._open_tables(self._remove_superseded_tables())
        highest_flushed_sequence = max((table.range.max for table in tables), default=0)
        wals = self._replay_unflushed_wals(highest_flushed_sequence)
        return tables, wals

    # A *.tmp file is a flush or merge that never reached its rename; its source data still exists.
    def _remove_temporary_files(self) -> None:
        for name in filter(is_temp_file_name, self._directory.list()):
            self._directory.remove(name)
            self._logger.warn("Recovery", "removed unfinished temporary file", {"file": name})

    # A table whose range lies inside another's is the input of a merge that finished writing its
    # output but crashed before deleting the inputs. The output already holds all of its data.
    def _remove_superseded_tables(self) -> list[tuple[str, TableRange]]:
        named = [(name, table_range) for name in self._directory.list() if (table_range := parse_table_file_name(name)) is not None]
        survivors: list[tuple[str, TableRange]] = []
        for name, table_range in named:
            container = next((other for other in named if other[1].strictly_contains(table_range)), None)
            if container is not None:
                self._directory.remove(name)
                self._logger.warn("Recovery", "removed table superseded by a finished merge", {"table": name, "mergedInto": container[0]})
            else:
                survivors.append((name, table_range))
        return survivors

    def _open_tables(self, named_tables: list[tuple[str, TableRange]]) -> list[SSTableReader]:
        ordered = sorted(named_tables, key=lambda table: table[1].max)
        tables = [self._reader_factory.open(name) for name, _ in ordered]
        for table in tables:
            self._logger.info("Recovery", "opened table", {"table": table.name, "entries": table.entry_count, "blocks": len(table.sparse_index.blocks)})
        return tables

    def _replay_unflushed_wals(self, highest_flushed_sequence: int) -> list[RecoveredWal]:
        wals = sorted(
            ((name, sequence) for name in self._directory.list() if (sequence := parse_wal_file_name(name)) is not None),
            key=lambda wal: wal[1],
        )

        replayed: list[RecoveredWal] = []
        for name, sequence in wals:
            # Already flushed: the crash happened after its SSTable was written but before it was deleted.
            if sequence <= highest_flushed_sequence:
                self._directory.remove(name)
                self._logger.info("Recovery", "removed WAL already covered by a table", {"wal": name})
                continue
            replay = WalReader.replay(self._directory, name)
            if replay.torn_bytes > 0:
                self._directory.truncate(name, replay.last_good_offset)
                self._logger.warn("Recovery", "torn WAL tail truncated", {"wal": name, "keptBytes": replay.last_good_offset, "droppedBytes": replay.torn_bytes})
            self._logger.info("Recovery", "replayed WAL", {"wal": name, "records": len(replay.entries)})
            replayed.append(RecoveredWal(name, sequence, replay.entries))
        return replayed
