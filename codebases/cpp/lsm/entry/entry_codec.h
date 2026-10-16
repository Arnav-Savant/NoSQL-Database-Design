#pragma once

#include <cstddef>
#include <vector>

#include "lsm/entry/entry.h"
#include "lsm/io/big_endian.h"

namespace lsm {

struct DecodedEntry {
  Entry entry;
  std::size_t bytes_read;
};

// Layout (big-endian): u16 keyLength | key UTF-8 | u8 valueType | u32 valueLength | value bytes
/// Serialises entries to bytes and back.
class EntryCodec {
 public:
  static Bytes encode(const Entry& entry);
  static DecodedEntry decode(const Bytes& buffer, std::size_t start);
  static std::vector<Entry> decode_all(const Bytes& buffer);
};

}  // namespace lsm
