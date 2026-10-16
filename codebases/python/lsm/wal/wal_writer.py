import struct

from lsm.entry.entry import Entry
from lsm.entry.entry_codec import EntryCodec
from lsm.io.crc32 import crc32
from lsm.io.file_names import wal_file_name
from lsm.io.storage_directory import StorageDirectory
from lsm.logging.logger import Logger

WAL_RECORD_HEADER = struct.Struct(">II")
WAL_RECORD_HEADER_BYTES = WAL_RECORD_HEADER.size


# Record layout (big-endian): u32 crc32(payload) | u32 payloadLength | payload (an encoded Entry)
class WalWriter:
    """Appends entries to one write-ahead log file."""

    def __init__(self, directory: StorageDirectory, sequence: int, logger: Logger) -> None:
        self._directory = directory
        self._logger = logger
        self.sequence = sequence
        self.name = wal_file_name(sequence)
        self._descriptor = directory.open_for_append(self.name)
        self.size_bytes = directory.size_of(self.name)
        self.record_count = 0

    def append(self, entry: Entry) -> None:
        payload = EntryCodec.encode(entry)
        record = WAL_RECORD_HEADER.pack(crc32(payload), len(payload)) + payload

        # NOTE: one fsync per write is the safest choice and the slowest. Production systems batch
        # several writes into one fsync (group commit) to trade a little latency for throughput.
        self._directory.append_and_sync(self._descriptor, record)
        self.size_bytes += len(record)
        self.record_count += 1
        self._logger.debug("Wal", "appended", {"wal": self.name, "key": entry.key, "bytes": len(record), "walBytes": self.size_bytes})

    def close(self) -> None:
        self._directory.close_file(self._descriptor)
