#pragma once

#include <cstddef>
#include <vector>

#include "lsm/entry/entry.h"

namespace lsm {

struct MergeResult {
  std::vector<Entry> entries;
  std::size_t duplicates_dropped = 0;
  std::size_t tombstones_dropped = 0;
};

/// Two-pointer merge of two sorted entry lists; on equal keys the newer entry wins.
class EntryMerger {
 public:
  MergeResult merge(const std::vector<Entry>& older_entries, const std::vector<Entry>& newer_entries,
                    bool drop_tombstones) const;
};

}  // namespace lsm
