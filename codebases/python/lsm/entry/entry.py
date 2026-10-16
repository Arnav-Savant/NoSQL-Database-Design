from dataclasses import dataclass

from lsm.entry.value import RawValue, Value, ValueType


@dataclass(frozen=True)
class Entry:
    """One key and its value at a point in time; a delete is an entry whose value is a tombstone."""

    key: str
    value: Value

    def __post_init__(self) -> None:
        if not isinstance(self.key, str) or len(self.key) == 0:
            raise ValueError("Keys must be non-empty strings.")

    @staticmethod
    def of(key: str, value: "Value | RawValue") -> "Entry":
        return Entry(key, value if isinstance(value, Value) else Value.from_raw(value))

    @staticmethod
    def tombstone(key: str) -> "Entry":
        return Entry(key, Value.tombstone())

    def is_tombstone(self) -> bool:
        return self.value.type == ValueType.TOMBSTONE
