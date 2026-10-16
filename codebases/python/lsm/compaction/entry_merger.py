from typing import NamedTuple

from lsm.entry.entry import Entry
from lsm.entry.key_order import compare_keys


class MergeResult(NamedTuple):
    """The merged entries and how many duplicates and tombstones the merge removed."""

    entries: list[Entry]
    duplicates_dropped: int
    tombstones_dropped: int


class EntryMerger:
    """Two-pointer merge of two sorted entry lists; on equal keys the newer entry wins."""

    def merge(self, older_entries: list[Entry], newer_entries: list[Entry], drop_tombstones: bool) -> MergeResult:
        entries: list[Entry] = []
        duplicates_dropped = 0
        tombstones_dropped = 0

        def emit(entry: Entry) -> None:
            nonlocal tombstones_dropped
            if drop_tombstones and entry.is_tombstone():
                tombstones_dropped += 1
            else:
                entries.append(entry)

        older = 0
        newer = 0
        while older < len(older_entries) and newer < len(newer_entries):
            order = compare_keys(older_entries[older].key, newer_entries[newer].key)
            if order < 0:
                emit(older_entries[older])
                older += 1
            elif order > 0:
                emit(newer_entries[newer])
                newer += 1
            else:
                emit(newer_entries[newer])
                newer += 1
                older += 1
                duplicates_dropped += 1
        for entry in older_entries[older:]:
            emit(entry)
        for entry in newer_entries[newer:]:
            emit(entry)

        return MergeResult(entries, duplicates_dropped, tombstones_dropped)
