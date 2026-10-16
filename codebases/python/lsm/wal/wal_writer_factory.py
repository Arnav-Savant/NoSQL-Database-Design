from lsm.io.storage_directory import StorageDirectory
from lsm.logging.logger import Logger
from lsm.wal.wal_writer import WalWriter


class WalWriterFactory:
    """Opens the write-ahead log for a given sequence number, creating the file if needed."""

    def __init__(self, directory: StorageDirectory, logger: Logger) -> None:
        self._directory = directory
        self._logger = logger

    def open(self, sequence: int) -> WalWriter:
        writer = WalWriter(self._directory, sequence, self._logger)
        self._logger.info("Wal", "opened", {"wal": writer.name, "walBytes": writer.size_bytes})
        return writer
