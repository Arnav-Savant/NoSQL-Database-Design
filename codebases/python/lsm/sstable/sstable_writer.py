from lsm.config.store_config import StoreConfig
from lsm.entry.entry import Entry
from lsm.entry.entry_codec import EntryCodec
from lsm.io.file_names import table_file_name
from lsm.io.storage_directory import StorageDirectory
from lsm.logging.logger import Logger
from lsm.sstable.bloom_filter import BloomFilter
from lsm.sstable.bloom_hasher import BloomHasher
from lsm.sstable.sparse_index import BlockHandle, SparseIndex
from lsm.sstable.table_format import FOOTER, TABLE_MAGIC
from lsm.sstable.table_range import TableRange


class SSTableWriter:
    """Writes sorted entries as an immutable SSTable file."""

    def __init__(self, directory: StorageDirectory, config: StoreConfig, hasher: BloomHasher, logger: Logger) -> None:
        self._directory = directory
        self._config = config
        self._hasher = hasher
        self._logger = logger

    # Entries must already be sorted by key with one entry per key. Returns the file name.
    def write(self, table_range: TableRange, entries: list[Entry]) -> str:
        bloom = BloomFilter.for_entry_count(len(entries), self._config.bloom_bits_per_key, self._hasher)
        data_bytes, blocks = self._pack_blocks(entries, bloom)
        index_bytes = SparseIndex(blocks).to_bytes()
        bloom_bytes = bloom.to_bytes()

        # NOTE: offsets are 32-bit, which limits one table to 4 GiB. Real engines use 64-bit offsets.
        footer = FOOTER.pack(len(data_bytes), len(data_bytes) + len(index_bytes), len(entries), TABLE_MAGIC)

        name = table_file_name(table_range)
        file_bytes = data_bytes + index_bytes + bloom_bytes + footer
        self._directory.write_atomically(name, file_bytes)
        self._logger.info("SSTable", "written", {
            "table": name,
            "entries": len(entries),
            "blocks": len(blocks),
            "bloomBits": f"{bloom.set_bit_count()}/{bloom.bit_count}",
            "bytes": len(file_bytes),
        })
        return name

    def _pack_blocks(self, entries: list[Entry], bloom: BloomFilter) -> tuple[bytes, list[BlockHandle]]:
        blocks: list[BlockHandle] = []
        chunks: list[bytes] = []
        offset = 0
        current: BlockHandle | None = None

        for entry in entries:
            encoded = EntryCodec.encode(entry)
            block_is_full = current is not None and current.length + len(encoded) > self._config.block_size_bytes
            if current is None or block_is_full:
                if current is not None:
                    blocks.append(current)
                current = BlockHandle(entry.key, offset, 0)
            chunks.append(encoded)
            current = current._replace(length=current.length + len(encoded))
            offset += len(encoded)
            bloom.add(entry.key)
        if current is not None:
            blocks.append(current)
        return b"".join(chunks), blocks
