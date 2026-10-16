import math
import struct

from lsm.sstable.bloom_hasher import BloomHasher

MIN_BITS = 64
MAX_HASHES = 8
_HEADER = struct.Struct(">IB")


# Layout: u32 bitCount | u8 hashCount | ceil(bitCount / 8) bytes (bit p lives in byte p >> 3, mask 1 << (p & 7))
class BloomFilter:
    """Probabilistic set membership: "definitely absent" is always right, "maybe present" can be wrong."""

    def __init__(self, bit_count: int, hash_count: int, bits: bytearray, hasher: BloomHasher) -> None:
        self.bit_count = bit_count
        self.hash_count = hash_count
        self._bits = bits
        self._hasher = hasher

    # NOTE: the size is fixed once built, but the false-positive rate rises as keys are added, so
    # each table sizes its filter from its own key count instead of using one global size.
    @staticmethod
    def for_entry_count(entry_count: int, bits_per_key: int, hasher: BloomHasher) -> "BloomFilter":
        wanted = math.ceil(entry_count * bits_per_key)
        bit_count = max(MIN_BITS, math.ceil(wanted / 8) * 8)
        # floor(x + 0.5) rounds halves up like JavaScript's Math.round; Python's round() would not.
        hash_count = min(MAX_HASHES, max(1, math.floor(bits_per_key * math.log(2) + 0.5)))
        return BloomFilter(bit_count, hash_count, bytearray(bit_count // 8), hasher)

    @staticmethod
    def from_bytes(data: bytes, hasher: BloomHasher) -> "BloomFilter":
        bit_count, hash_count = _HEADER.unpack_from(data, 0)
        bits = bytearray(data[_HEADER.size:_HEADER.size + bit_count // 8])
        return BloomFilter(bit_count, hash_count, bits, hasher)

    def add(self, key: str) -> None:
        for position in self.positions_of(key):
            self._bits[position >> 3] |= 1 << (position & 7)

    def might_contain(self, key: str) -> bool:
        return all(self._is_set(position) for position in self.positions_of(key))

    def positions_of(self, key: str) -> list[int]:
        return self._hasher.positions(key, self.bit_count, self.hash_count)

    def set_bit_count(self) -> int:
        return sum(1 for position in range(self.bit_count) if self._is_set(position))

    def to_bytes(self) -> bytes:
        return _HEADER.pack(self.bit_count, self.hash_count) + bytes(self._bits)

    def _is_set(self, position: int) -> bool:
        return self._bits[position >> 3] & (1 << (position & 7)) != 0
