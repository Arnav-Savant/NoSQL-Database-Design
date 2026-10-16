import os
from pathlib import Path

from lsm.io.file_names import TEMP_SUFFIX


class StorageDirectory:
    """All file-system access of the store, by file name inside one data directory."""

    def __init__(self, root: str | os.PathLike[str]) -> None:
        self._root = Path(root).resolve()

    @property
    def root(self) -> Path:
        return self._root

    def ensure_exists(self) -> None:
        self._root.mkdir(parents=True, exist_ok=True)

    def list(self) -> list[str]:
        return sorted(os.listdir(self._root))

    def path_of(self, name: str) -> Path:
        return self._root / name

    def size_of(self, name: str) -> int:
        return os.stat(self.path_of(name)).st_size

    def read_all(self, name: str) -> bytes:
        return self.path_of(name).read_bytes()

    def read_range(self, name: str, offset: int, length: int) -> bytes:
        descriptor = os.open(self.path_of(name), os.O_RDONLY)
        try:
            data = os.pread(descriptor, length, offset)
        finally:
            os.close(descriptor)
        if len(data) != length:
            raise OSError(f"Short read in {name}: wanted {length} bytes at {offset}, got {len(data)}.")
        return data

    # A crash can never leave a half-written file under its final name: the bytes go to a
    # temporary file, reach the disk, and only then does an atomic rename publish them.
    def write_atomically(self, name: str, data: bytes) -> None:
        temporary_name = f"{name}{TEMP_SUFFIX}"
        descriptor = os.open(self.path_of(temporary_name), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
        try:
            _write_fully(descriptor, data)
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        os.replace(self.path_of(temporary_name), self.path_of(name))
        self._sync_directory()

    def open_for_append(self, name: str) -> int:
        descriptor = os.open(self.path_of(name), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
        self._sync_directory()
        return descriptor

    def append_and_sync(self, descriptor: int, data: bytes) -> None:
        _write_fully(descriptor, data)
        os.fsync(descriptor)

    def close_file(self, descriptor: int) -> None:
        os.close(descriptor)

    def truncate(self, name: str, length: int) -> None:
        os.truncate(self.path_of(name), length)

    def remove(self, name: str) -> None:
        self.path_of(name).unlink(missing_ok=True)
        self._sync_directory()

    # NOTE: syncing the directory makes the creation, rename or deletion of a file itself durable.
    # This works on Linux; some platforms don't allow opening a directory and skip this step.
    def _sync_directory(self) -> None:
        try:
            descriptor = os.open(self._root, os.O_RDONLY)
        except OSError:
            return  # Best effort on platforms without directory fsync.
        try:
            os.fsync(descriptor)
        except OSError:
            pass  # Best effort on platforms without directory fsync.
        finally:
            os.close(descriptor)


# os.write may write fewer bytes than asked; keep going until everything is out.
def _write_fully(descriptor: int, data: bytes) -> None:
    view = memoryview(data)
    while view:
        written = os.write(descriptor, view)
        view = view[written:]
