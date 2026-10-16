import struct

from lsm.entry.entry import Entry
from lsm.entry.value import Value, ValueType

MAX_KEY_BYTES = 0xFFFF
_HEADER = struct.Struct(">H")
_VALUE_HEADER = struct.Struct(">BI")
_DOUBLE = struct.Struct(">d")


# Layout (big-endian): u16 keyLength | key UTF-8 | u8 valueType | u32 valueLength | value bytes
class EntryCodec:
    """Serialises entries to bytes and back."""

    @staticmethod
    def encode(entry: Entry) -> bytes:
        key_bytes = entry.key.encode("utf-8")
        if len(key_bytes) > MAX_KEY_BYTES:
            raise ValueError(f'Key "{entry.key[:20]}…" exceeds {MAX_KEY_BYTES} bytes.')
        value_bytes = _encode_value(entry.value)
        return b"".join((
            _HEADER.pack(len(key_bytes)),
            key_bytes,
            _VALUE_HEADER.pack(entry.value.type, len(value_bytes)),
            value_bytes,
        ))

    @staticmethod
    def decode(buffer: bytes, start: int) -> tuple[Entry, int]:
        # Returns the entry starting at `start` and the number of bytes it occupied.
        offset = start
        (key_length,) = _HEADER.unpack_from(buffer, offset)
        offset += _HEADER.size
        key = bytes(buffer[offset:offset + key_length]).decode("utf-8")
        offset += key_length
        value_type, value_length = _VALUE_HEADER.unpack_from(buffer, offset)
        offset += _VALUE_HEADER.size
        if offset + value_length > len(buffer):
            raise ValueError("Entry extends past the end of the buffer.")
        value = _decode_value(value_type, bytes(buffer[offset:offset + value_length]))
        offset += value_length
        return Entry(key, value), offset - start

    @staticmethod
    def decode_all(buffer: bytes) -> list[Entry]:
        entries: list[Entry] = []
        offset = 0
        while offset < len(buffer):
            entry, bytes_read = EntryCodec.decode(buffer, offset)
            entries.append(entry)
            offset += bytes_read
        return entries


def _encode_value(value: Value) -> bytes:
    match value.type:
        case ValueType.NULL | ValueType.TOMBSTONE:
            return b""
        case ValueType.BOOLEAN:
            return bytes([1 if value.data else 0])
        case ValueType.NUMBER:
            return _DOUBLE.pack(value.data)
        case ValueType.STRING:
            return str(value.data).encode("utf-8")
        case _:
            raise ValueError(f"Unknown value type {value.type}.")


def _decode_value(value_type: int, data: bytes) -> Value:
    match value_type:
        case ValueType.NULL:
            return Value.null()
        case ValueType.TOMBSTONE:
            return Value.tombstone()
        case ValueType.BOOLEAN:
            return Value.boolean(data[0] == 1)
        case ValueType.NUMBER:
            return Value.number(_DOUBLE.unpack_from(data, 0)[0])
        case ValueType.STRING:
            return Value.string(data.decode("utf-8"))
        case _:
            raise ValueError(f"Unknown value type {value_type} on disk.")
