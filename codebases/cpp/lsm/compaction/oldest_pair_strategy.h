#pragma once

#include <cstddef>

#include "lsm/compaction/compaction_strategy.h"

namespace lsm {

/// Once the table count reaches the trigger, merge the two oldest tables.
class OldestPairStrategy : public CompactionStrategy {
 public:
  explicit OldestPairStrategy(std::size_t trigger);

  std::optional<std::pair<TablePtr, TablePtr>> select_inputs(
      const std::vector<TablePtr>& tables_oldest_first) const override;

 private:
  std::size_t trigger_;
};

}  // namespace lsm
