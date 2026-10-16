import struct
from collections.abc import Iterable
from typing import NamedTuple

from lsm.entry.key_order import compare_keys

_COUNT = struct.Struct(">I")
_KEY_LENGTH = struct.Struct(">H")
_POSITION = struct.Struct(">II")


class BlockHandle(NamedTuple):
    """Where one data block starts, how long it is, and the first key it holds."""

    first_key: str
    offset: int
    length: int


# Layout: u32 blockCount | per block: u16 keyLength | first key | u32 offset | u32 length
class SparseIndex:
    """One entry per data block: the block's first key, where it starts, and how long it is."""

    def __init__(self, blocks: Iterable[BlockHandle]) -> None:
        self.blocks: tuple[BlockHandle, ...] = tuple(blocks)

    @staticmethod
    def from_bytes(data: bytes) -> "SparseIndex":
        blocks: list[BlockHandle] = []
        (block_count,) = _COUNT.unpack_from(data, 0)
        offset = _COUNT.size
        for _ in range(block_count):
            (key_length,) = _KEY_LENGTH.unpack_from(data, offset)
            offset += _KEY_LENGTH.size
            first_key = data[offset:offset + key_length].decode("utf-8")
            offset += key_length
            block_offset, length = _POSITION.unpack_from(data, offset)
            offset += _POSITION.size
            blocks.append(BlockHandle(first_key, block_offset, length))
        return SparseIndex(blocks)

    # The only block that can hold `key`: the last one whose first key is <= key. Returns its
    # zero-based index with the handle, or None when the key sorts before every block.
    def locate(self, key: str) -> tuple[int, BlockHandle] | None:
        low = 0
        high = len(self.blocks) - 1
        found = -1
        while low <= high:
            middle = (low + high) >> 1
            if compare_keys(self.blocks[middle].first_key, key) <= 0:
                found = middle
                low = middle + 1
            else:
                high = middle - 1
        return None if found == -1 else (found, self.blocks[found])

    def to_bytes(self) -> bytes:
        parts = [_COUNT.pack(len(self.blocks))]
        for block in self.blocks:
            key_bytes = block.first_key.encode("utf-8")
            parts.extend((_KEY_LENGTH.pack(len(key_bytes)), key_bytes, _POSITION.pack(block.offset, block.length)))
        return b"".join(parts)
