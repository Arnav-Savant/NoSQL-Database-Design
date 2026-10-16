import re

from lsm.sstable.table_range import TableRange

SEQUENCE_DIGITS = 6
# [0-9] rather than \d, which in Python would also accept non-ASCII digits.
_WAL_PATTERN = re.compile(r"wal-([0-9]{6})\.log")
_TABLE_PATTERN = re.compile(r"sst-([0-9]{6})-([0-9]{6})\.sst")
TEMP_SUFFIX = ".tmp"


def _pad(sequence: int) -> str:
    return str(sequence).zfill(SEQUENCE_DIGITS)


def wal_file_name(sequence: int) -> str:
    return f"wal-{_pad(sequence)}.log"


def table_file_name(table_range: TableRange) -> str:
    return f"sst-{_pad(table_range.min)}-{_pad(table_range.max)}.sst"


def parse_wal_file_name(name: str) -> int | None:
    match = _WAL_PATTERN.fullmatch(name)
    return int(match.group(1)) if match else None


def parse_table_file_name(name: str) -> TableRange | None:
    match = _TABLE_PATTERN.fullmatch(name)
    return TableRange(int(match.group(1)), int(match.group(2))) if match else None


def is_temp_file_name(name: str) -> bool:
    return name.endswith(TEMP_SUFFIX)
