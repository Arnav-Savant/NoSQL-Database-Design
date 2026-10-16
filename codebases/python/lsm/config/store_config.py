from collections.abc import Mapping
from dataclasses import dataclass, fields
from types import MappingProxyType
from typing import Any


@dataclass(frozen=True)
class StoreConfig:
    """Tunable limits of the store."""

    wal_max_bytes: int
    block_size_bytes: int
    memtable_capacity: int
    compaction_trigger: int
    bloom_bits_per_key: int
    eviction_policy: str
    log_level: str


DEFAULT_CONFIG: Mapping[str, Any] = MappingProxyType({
    "wal_max_bytes": 4 * 1024 * 1024,
    "block_size_bytes": 4096,
    "memtable_capacity": 100_000,
    "compaction_trigger": 4,
    "bloom_bits_per_key": 10,
    "eviction_policy": "lru",
    "log_level": "info",
})

# Deliberately tiny so the demo triggers flushes, evictions and compactions within a few writes.
DEMO_CONFIG: Mapping[str, Any] = MappingProxyType({
    "wal_max_bytes": 128,
    "block_size_bytes": 64,
    "memtable_capacity": 6,
    "compaction_trigger": 3,
    "bloom_bits_per_key": 6,
    "eviction_policy": "lru",
    "log_level": "debug",
})

_POSITIVE_INTEGER_FIELDS = ("wal_max_bytes", "block_size_bytes", "memtable_capacity", "compaction_trigger", "bloom_bits_per_key")


def create_config(overrides: Mapping[str, Any] | None = None) -> StoreConfig:
    values = {**DEFAULT_CONFIG, **(overrides or {})}
    known = {field.name for field in fields(StoreConfig)}
    unknown = sorted(set(values) - known)
    if unknown:
        raise ValueError(f'Unknown config field "{unknown[0]}".')
    for name in _POSITIVE_INTEGER_FIELDS:
        value = values[name]
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError(f'Config field "{name}" must be a positive integer, got {value}.')
    if values["compaction_trigger"] < 2:
        raise ValueError('Config field "compaction_trigger" must be at least 2, because a merge needs two tables.')
    return StoreConfig(**values)
