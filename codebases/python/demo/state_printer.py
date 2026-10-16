import struct
from typing import Any

from demo.narrator import Narrator

VALUE_TYPE_NAMES = ("null", "boolean", "number", "string", "tombstone")


class StatePrinter:
    """Renders store snapshots and raw WAL records as aligned text."""

    def __init__(self, narrator: Narrator) -> None:
        self._narrator = narrator

    def print_snapshot(self, snapshot: dict[str, Any]) -> None:
        active_wal = snapshot["active_wal"]
        memtable = snapshot["memtable"]
        tables = snapshot["tables"]
        rows = memtable["rows"]
        dirty = sum(1 for row in rows if row["state"] == "dirty")
        out = self._narrator.line

        out("")
        out(f"  Active WAL   {active_wal['name']}  {active_wal['size_bytes']} bytes, {active_wal['records']} records appended since opened")
        out(f"  Memtable     {len(rows)} of {memtable['capacity']} slots used, {dirty} dirty")
        if rows:
            key_width = max(3, *(len(row["key"]) for row in rows))
            value_width = max(5, *(len(row["value"]) for row in rows))
            out(f"               {'key'.ljust(key_width)}  {'value'.ljust(value_width)}  state")
            for row in rows:
                out(f"               {row['key'].ljust(key_width)}  {row['value'].ljust(value_width)}  {row['state']}")
        if not tables:
            out("  SSTables     none yet")
            return
        out("  SSTables     newest first")
        for table in tables:
            bloom = table["bloom"]
            out(
                f"               {table['name']}  {table['entry_count']} entries, {len(table['blocks'])} blocks, "
                f"bloom {bloom['set_bits']} of {bloom['bit_count']} bits set (k={bloom['hash_count']})"
            )
            for index, block in enumerate(table["blocks"]):
                out(f"                 block {index + 1}  offset {str(block['offset']).rjust(3)}  {str(block['length']).rjust(3)} bytes  first key {block['first_key']}")

    def print_wal_record(self, record: bytes) -> None:
        def hex_bytes(start: int, end: int) -> str:
            return " ".join(f"{byte:02x}" for byte in record[start:end])

        (payload_length,) = struct.unpack_from(">I", record, 4)
        (key_length,) = struct.unpack_from(">H", record, 8)
        key_end = 10 + key_length
        (value_type,) = struct.unpack_from(">B", record, key_end)
        (value_length,) = struct.unpack_from(">I", record, key_end + 1)
        value_start = key_end + 5
        out = self._narrator.line

        out("")
        out(f"  checksum      {hex_bytes(0, 4)}")
        out(f"  length        {hex_bytes(4, 8)}   payload is {payload_length} bytes")
        out(f"  key length    {hex_bytes(8, 10)}")
        out(f"  key           {hex_bytes(10, key_end)}   \"{record[10:key_end].decode('utf-8')}\"")
        out(f"  value type    {hex_bytes(key_end, key_end + 1)}   {VALUE_TYPE_NAMES[value_type]}")
        out(f"  value length  {hex_bytes(key_end + 1, value_start)}")
        out(f"  value         {hex_bytes(value_start, value_start + value_length)}   8-byte IEEE-754 double")
