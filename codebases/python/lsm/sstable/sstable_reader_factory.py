from lsm.io.storage_directory import StorageDirectory
from lsm.logging.logger import Logger
from lsm.sstable.bloom_hasher import BloomHasher
from lsm.sstable.sstable_reader import SSTableReader


class SSTableReaderFactory:
    """Opens SSTables by file name with the store's shared hasher and logger."""

    def __init__(self, directory: StorageDirectory, hasher: BloomHasher, logger: Logger) -> None:
        self._directory = directory
        self._hasher = hasher
        self._logger = logger

    def open(self, name: str) -> SSTableReader:
        return SSTableReader.open(self._directory, name, self._hasher, self._logger)
