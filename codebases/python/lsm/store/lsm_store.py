from typing import Any

from lsm.compaction.compactor import Compactor
from lsm.config.store_config import StoreConfig
from lsm.entry.entry import Entry
from lsm.entry.value import RawValue, Value
from lsm.io.storage_directory import StorageDirectory
from lsm.logging.logger import Logger
from lsm.memtable.memtable import Memtable
from lsm.recovery.recovery_manager import RecoveryManager
from lsm.sstable.sstable_reader import SSTableReader
from lsm.sstable.sstable_reader_factory import SSTableReaderFactory
from lsm.sstable.sstable_writer import SSTableWriter
from lsm.sstable.table_range import TableRange
from lsm.store.contracts import KeyValueReader, KeyValueWriter, Lifecycle, StoreInspector
from lsm.wal.wal_writer import WalWriter
from lsm.wal.wal_writer_factory import WalWriterFactory


class LsmStore(KeyValueReader, KeyValueWriter, Lifecycle, StoreInspector):
    """A log-structured merge tree key-value store."""

    def __init__(
        self,
        *,
        config: StoreConfig,
        directory: StorageDirectory,
        logger: Logger,
        memtable: Memtable,
        wal_factory: WalWriterFactory,
        table_writer: SSTableWriter,
        table_reader_factory: SSTableReaderFactory,
        compactor: Compactor,
        recovery_manager: RecoveryManager,
    ) -> None:
        self._config = config
        self._directory = directory
        self._logger = logger
        self._memtable = memtable
        self._wal_factory = wal_factory
        self._table_writer = table_writer
        self._table_reader_factory = table_reader_factory
        self._compactor = compactor
        self._recovery_manager = recovery_manager

        self._wal: WalWriter | None = None
        self._tables: list[SSTableReader] = []
        self._unflushed_wal_names: list[str] = []
        self._oldest_unflushed_sequence = 0

    def open(self) -> None:
        self._directory.ensure_exists()
        tables, wals = self._recovery_manager.recover()
        self._tables = tables

        for wal in wals:
            for entry in wal.entries:
                self._memtable.put_dirty(entry)

        highest_table_sequence = max((table.range.max for table in tables), default=0)
        active_sequence = wals[-1].sequence if wals else highest_table_sequence + 1
        self._wal = self._wal_factory.open(active_sequence)
        self._unflushed_wal_names = [wal.name for wal in wals] if wals else [self._wal.name]
        self._oldest_unflushed_sequence = wals[0].sequence if wals else active_sequence

        self._logger.info("Store", "opened", {
            "tables": len(tables),
            "activeWal": self._wal.name,
            "recoveredEntries": self._memtable.size,
        })
        # Several unflushed WALs mean a crash interrupted a flush; fold them into one table now.
        if len(wals) > 1 or self._flush_is_due():
            self._flush("recovery")

    def close(self) -> None:
        if self._wal is not None:
            self._wal.close()
        self._wal = None
        self._logger.info("Store", "closed")

    def put(self, key: str, value: Value | RawValue) -> None:
        self._write(Entry.of(key, value))

    def delete(self, key: str) -> None:
        self._write(Entry.tombstone(key))

    def get(self, key: str) -> Value | None:
        cached = self._memtable.get(key)
        if cached is not None:
            self._logger.debug("Read", "memtable hit", {"key": key, "state": cached.state, "value": cached.entry.value.display})
            return None if cached.entry.is_tombstone() else cached.entry.value
        self._logger.debug("Read", "memtable miss, checking tables newest first", {"key": key, "tables": len(self._tables)})

        for table in self._tables_newest_first():
            if not table.might_contain(key):
                self._logger.debug("Read", "bloom filter says definitely absent, table skipped", {"key": key, "table": table.name})
                continue
            entry = table.find(key)
            if entry is None:
                self._logger.debug("Read", "bloom filter false positive, key not in block", {"key": key, "table": table.name})
                continue
            self._logger.debug("Read", "found on disk", {"key": key, "table": table.name, "value": entry.value.display})
            self._memtable.put_clean(entry)
            return None if entry.is_tombstone() else entry.value
        self._logger.debug("Read", "not found in any table", {"key": key})
        return None

    def snapshot(self) -> dict[str, Any]:
        wal = self._active_wal()
        return {
            "active_wal": {"name": wal.name, "size_bytes": wal.size_bytes, "records": wal.record_count},
            "memtable": {"capacity": self._memtable.capacity, "rows": self._memtable.rows()},
            "tables": [table.describe() for table in self._tables_newest_first()],
        }

    def _write(self, entry: Entry) -> None:
        # Durable first: once the WAL append returns, a crash can no longer lose this write.
        self._active_wal().append(entry)
        self._memtable.put_dirty(entry)
        if self._flush_is_due():
            self._flush("memtable full of dirty entries" if self._memtable.is_saturated_with_dirty() else "WAL reached its size limit")

    def _flush_is_due(self) -> bool:
        return self._active_wal().size_bytes >= self._config.wal_max_bytes or self._memtable.is_saturated_with_dirty()

    def _flush(self, reason: str) -> None:
        entries = self._memtable.dirty_entries_sorted_by_key()
        if not entries:
            return
        self._logger.info("Flush", "started", {"reason": reason, "dirtyEntries": len(entries)})

        wal = self._active_wal()
        table_range = TableRange(self._oldest_unflushed_sequence, wal.sequence)
        table_name = self._table_writer.write(table_range, entries)
        self._tables.append(self._table_reader_factory.open(table_name))
        self._memtable.mark_all_clean()

        # Only now that the table is durable can the WALs it replaces be deleted.
        next_sequence = wal.sequence + 1
        wal.close()
        for wal_name in self._unflushed_wal_names:
            self._directory.remove(wal_name)
            self._logger.info("Wal", "deleted, its entries are in the new table", {"wal": wal_name})
        self._wal = self._wal_factory.open(next_sequence)
        self._unflushed_wal_names = [self._wal.name]
        self._oldest_unflushed_sequence = next_sequence
        self._logger.info("Flush", "finished", {"table": table_name, "cleanEntries": self._memtable.size})

        self._tables = self._compactor.compact_until_stable(self._tables)

    def _active_wal(self) -> WalWriter:
        if self._wal is None:
            raise RuntimeError("The store is not open.")
        return self._wal

    def _tables_newest_first(self) -> list[SSTableReader]:
        return sorted(self._tables, key=lambda table: table.range.max, reverse=True)
