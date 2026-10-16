FNV_OFFSET_BASIS = 0x811C9DC5
FNV_PRIME = 0x01000193
SECOND_HASH_SEED = 0x5BD1E995
_UINT32_MASK = 0xFFFFFFFF


def _fnv1a32(data: bytes, seed: int) -> int:
    hash_value = seed & _UINT32_MASK
    for byte in data:
        hash_value ^= byte
        # Python integers never overflow, so the product is masked back to 32 bits by hand.
        hash_value = (hash_value * FNV_PRIME) & _UINT32_MASK
    return hash_value


class BloomHasher:
    """Derives k bit positions from two FNV-1a hashes of the key (double hashing)."""

    def positions(self, key: str, bit_count: int, hash_count: int) -> list[int]:
        key_bytes = key.encode("utf-8")
        first = _fnv1a32(key_bytes, FNV_OFFSET_BASIS)
        # An odd step keeps the k probes from collapsing onto the same bit.
        second = _fnv1a32(key_bytes, FNV_OFFSET_BASIS ^ SECOND_HASH_SEED) | 1
        return [(first + i * second) % bit_count for i in range(hash_count)]
