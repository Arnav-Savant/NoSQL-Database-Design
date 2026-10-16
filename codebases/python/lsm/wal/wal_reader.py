from typing import NamedTuple

from lsm.entry.entry import Entry
from lsm.entry.entry_codec import EntryCodec
from lsm.io.crc32 import crc32
from lsm.io.storage_directory import StorageDirectory
from lsm.wal.wal_writer import WAL_RECORD_HEADER, WAL_RECORD_HEADER_BYTES


class WalReplay(NamedTuple):
    """The valid records of a WAL and where its torn tail, if any, begins."""

    entries: list[Entry]
    last_good_offset: int
    torn_bytes: int


class WalReader:
    """Replays a write-ahead log, stopping at the first record that is incomplete or corrupt."""

    @staticmethod
    def replay(directory: StorageDirectory, name: str) -> WalReplay:
        data = directory.read_all(name)
        entries: list[Entry] = []
        offset = 0

        while offset < len(data):
            remaining = len(data) - offset
            if remaining < WAL_RECORD_HEADER_BYTES:
                break

            expected_checksum, payload_length = WAL_RECORD_HEADER.unpack_from(data, offset)
            if remaining < WAL_RECORD_HEADER_BYTES + payload_length:
                break

            payload_start = offset + WAL_RECORD_HEADER_BYTES
            payload = data[payload_start:payload_start + payload_length]
            if crc32(payload) != expected_checksum:
                break

            entries.append(EntryCodec.decode(payload, 0)[0])
            offset = payload_start + payload_length

        # Anything after the last valid record was being written when the process died. That write
        # was never acknowledged, so dropping it loses nothing a client was promised.
        return WalReplay(entries, offset, len(data) - offset)
