#include "lsm/compaction/oldest_pair_strategy.h"

namespace lsm {

OldestPairStrategy::OldestPairStrategy(std::size_t trigger) : trigger_(trigger) {}

// Always merging the two oldest keeps the inputs adjacent in time, so the output's range never
// overlaps a table it didn't absorb, and newest-first read order stays correct.
std::optional<std::pair<TablePtr, TablePtr>> OldestPairStrategy::select_inputs(
    const std::vector<TablePtr>& tables_oldest_first) const {
  if (tables_oldest_first.size() < trigger_ || tables_oldest_first.size() < 2) return std::nullopt;
  return std::make_pair(tables_oldest_first[0], tables_oldest_first[1]);
}

}  // namespace lsm
