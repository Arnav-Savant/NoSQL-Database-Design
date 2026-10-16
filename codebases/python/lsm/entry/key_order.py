# Keys are ordered by their UTF-8 bytes, compared as unsigned values. Every language port uses
# the same rule, so a table sorted by one port can be searched by another.
def compare_keys(left: str, right: str) -> int:
    left_bytes = left.encode("utf-8")
    right_bytes = right.encode("utf-8")
    return (left_bytes > right_bytes) - (left_bytes < right_bytes)


# Sort key for `sorted(..., key=...)` that orders exactly like `compare_keys`.
def key_bytes(key: str) -> bytes:
    return key.encode("utf-8")
