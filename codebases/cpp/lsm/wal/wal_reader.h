#pragma once

#include <cstddef>
#include <string>
#include <vector>

#include "lsm/entry/entry.h"
#include "lsm/io/storage_directory.h"

namespace lsm {

struct WalReplay {
  std::vector<Entry> entries;
  std::size_t last_good_offset;
  std::size_t torn_bytes;
};

/// Replays a write-ahead log, stopping at the first record that is incomplete or corrupt.
class WalReader {
 public:
  static WalReplay replay(const StorageDirectory& directory, const std::string& name);
};

}  // namespace lsm
