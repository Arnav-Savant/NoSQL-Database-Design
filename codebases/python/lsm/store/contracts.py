from typing import Any, Protocol, runtime_checkable

from lsm.entry.value import RawValue, Value


@runtime_checkable
class KeyValueReader(Protocol):
    """Point lookups by key."""

    # Returns the current Value, or None when the key is absent or deleted.
    def get(self, key: str) -> Value | None: ...


@runtime_checkable
class KeyValueWriter(Protocol):
    """Inserts, updates and deletes."""

    def put(self, key: str, value: Value | RawValue) -> None: ...

    def delete(self, key: str) -> None: ...


@runtime_checkable
class Lifecycle(Protocol):
    """Opening (with recovery) and closing."""

    def open(self) -> None: ...

    def close(self) -> None: ...


@runtime_checkable
class StoreInspector(Protocol):
    """Read-only view of internal state, for teaching and debugging."""

    def snapshot(self) -> dict[str, Any]: ...
