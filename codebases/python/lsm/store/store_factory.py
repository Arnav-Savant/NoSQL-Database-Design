import os
from collections.abc import Callable, Mapping
from types import MappingProxyType

from lsm.compaction.compactor import Compactor
from lsm.compaction.entry_merger import EntryMerger
from lsm.compaction.oldest_pair_strategy import OldestPairStrategy
from lsm.config.store_config import StoreConfig
from lsm.io.storage_directory import StorageDirectory
from lsm.logging.logger import Logger
from lsm.memtable.eviction.eviction_policy import EvictionPolicy
from lsm.memtable.eviction.fifo_eviction_policy import FifoEvictionPolicy
from lsm.memtable.eviction.lfu_eviction_policy import LfuEvictionPolicy
from lsm.memtable.eviction.lru_eviction_policy import LruEvictionPolicy
from lsm.memtable.memtable import Memtable
from lsm.recovery.recovery_manager import RecoveryManager
from lsm.sstable.bloom_hasher import BloomHasher
from lsm.sstable.sstable_reader_factory import SSTableReaderFactory
from lsm.sstable.sstable_writer import SSTableWriter
from lsm.store.lsm_store import LsmStore
from lsm.wal.wal_writer_factory import WalWriterFactory

EVICTION_POLICIES: Mapping[str, Callable[[], EvictionPolicy]] = MappingProxyType({
    "lru": LruEvictionPolicy,
    "lfu": LfuEvictionPolicy,
    "fifo": FifoEvictionPolicy,
})


class StoreFactory:
    """The one place where concrete implementations are chosen and wired together."""

    @staticmethod
    def create(config: StoreConfig, logger: Logger, data_directory: str | os.PathLike[str]) -> LsmStore:
        create_policy = EVICTION_POLICIES.get(config.eviction_policy)
        if create_policy is None:
            raise ValueError(f'Unknown eviction policy "{config.eviction_policy}". Use lru, lfu or fifo.')

        directory = StorageDirectory(data_directory)
        hasher = BloomHasher()
        table_writer = SSTableWriter(directory, config, hasher, logger)
        table_reader_factory = SSTableReaderFactory(directory, hasher, logger)
        compactor = Compactor(
            OldestPairStrategy(config.compaction_trigger),
            EntryMerger(),
            table_writer,
            table_reader_factory,
            directory,
            logger,
        )

        # LsmStore inherits every contract explicitly, so no structural check is needed here.
        return LsmStore(
            config=config,
            directory=directory,
            logger=logger,
            memtable=Memtable(config.memtable_capacity, create_policy(), logger),
            wal_factory=WalWriterFactory(directory, logger),
            table_writer=table_writer,
            table_reader_factory=table_reader_factory,
            compactor=compactor,
            recovery_manager=RecoveryManager(directory, table_reader_factory, logger),
        )
