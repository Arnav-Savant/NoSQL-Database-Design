#pragma once

#include <optional>
#include <utility>
#include <vector>

#include "lsm/sstable/sstable_reader.h"

namespace lsm {

/// Chooses which tables to merge next.
class CompactionStrategy {
 public:
  virtual ~CompactionStrategy() = default;

  // Receives tables ordered oldest first; returns {older, newer} or nullopt when no merge is due.
  virtual std::optional<std::pair<TablePtr, TablePtr>> select_inputs(
      const std::vector<TablePtr>& tables_oldest_first) const = 0;
};

}  // namespace lsm
