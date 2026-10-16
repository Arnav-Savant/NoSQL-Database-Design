from typing import Any

from lsm.entry.entry import Entry
from lsm.entry.entry_codec import EntryCodec
from lsm.entry.key_order import compare_keys
from lsm.io.file_names import parse_table_file_name
from lsm.io.storage_directory import StorageDirectory
from lsm.logging.logger import Logger
from lsm.sstable.bloom_filter import BloomFilter
from lsm.sstable.bloom_hasher import BloomHasher
from lsm.sstable.sparse_index import SparseIndex
from lsm.sstable.table_format import FOOTER, FOOTER_BYTES, TABLE_MAGIC
from lsm.sstable.table_range import TableRange


class SSTableReader:
    """Reads one SSTable: the index and Bloom filter stay in memory, data blocks are read on demand."""

    def __init__(
        self,
        *,
        directory: StorageDirectory,
        logger: Logger,
        name: str,
        table_range: TableRange,
        entry_count: int,
        index_offset: int,
        sparse_index: SparseIndex,
        bloom: BloomFilter,
    ) -> None:
        self._directory = directory
        self._logger = logger
        self._index_offset = index_offset
        self.name = name
        self.range = table_range
        self.entry_count = entry_count
        self.sparse_index = sparse_index
        self.bloom = bloom

    @staticmethod
    def open(directory: StorageDirectory, name: str, hasher: BloomHasher, logger: Logger) -> "SSTableReader":
        table_range = parse_table_file_name(name)
        if table_range is None:
            raise ValueError(f'"{name}" is not an SSTable file name.')
        file_size = directory.size_of(name)
        footer = directory.read_range(name, file_size - FOOTER_BYTES, FOOTER_BYTES)
        index_offset, bloom_offset, entry_count, magic = FOOTER.unpack(footer)
        if magic != TABLE_MAGIC:
            raise ValueError(f"{name} has no valid SSTable footer.")

        sparse_index = SparseIndex.from_bytes(directory.read_range(name, index_offset, bloom_offset - index_offset))
        bloom = BloomFilter.from_bytes(directory.read_range(name, bloom_offset, file_size - FOOTER_BYTES - bloom_offset), hasher)
        return SSTableReader(
            directory=directory,
            logger=logger,
            name=name,
            table_range=table_range,
            entry_count=entry_count,
            index_offset=index_offset,
            sparse_index=sparse_index,
            bloom=bloom,
        )

    def might_contain(self, key: str) -> bool:
        return self.bloom.might_contain(key)

    # Reads at most one block from disk; returns the entry (possibly a tombstone) or None.
    def find(self, key: str) -> Entry | None:
        located = self.sparse_index.locate(key)
        if located is None:
            self._logger.debug("SSTable", "key sorts before the first block, no read needed", {"table": self.name, "key": key})
            return None
        index, block = located
        entries = EntryCodec.decode_all(self._directory.read_range(self.name, block.offset, block.length))
        self._logger.debug("SSTable", "block read", {"table": self.name, "block": index + 1, "firstKey": block.first_key, "bytes": block.length})

        low = 0
        high = len(entries) - 1
        while low <= high:
            middle = (low + high) >> 1
            order = compare_keys(entries[middle].key, key)
            if order == 0:
                return entries[middle]
            if order < 0:
                low = middle + 1
            else:
                high = middle - 1
        return None

    def read_all_entries(self) -> list[Entry]:
        return EntryCodec.decode_all(self._directory.read_range(self.name, 0, self._index_offset))

    def describe(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "min_sequence": self.range.min,
            "max_sequence": self.range.max,
            "entry_count": self.entry_count,
            "blocks": [block._asdict() for block in self.sparse_index.blocks],
            "bloom": {"bit_count": self.bloom.bit_count, "hash_count": self.bloom.hash_count, "set_bits": self.bloom.set_bit_count()},
        }
