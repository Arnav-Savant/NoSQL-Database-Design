#include "lsm/memtable/eviction/fifo_eviction_policy.h"

namespace lsm {

void FifoEvictionPolicy::record_insert(const std::string& key) {
  if (positions_.count(key) == 0) positions_[key] = arrivals_.insert(arrivals_.end(), key);
}

void FifoEvictionPolicy::record_access(const std::string& key) { record_insert(key); }

void FifoEvictionPolicy::record_removal(const std::string& key) {
  const auto found = positions_.find(key);
  if (found == positions_.end()) return;
  arrivals_.erase(found->second);
  positions_.erase(found);
}

std::optional<std::string> FifoEvictionPolicy::select_victim(const EvictablePredicate& is_evictable) const {
  for (const std::string& key : arrivals_) {
    if (is_evictable(key)) return key;
  }
  return std::nullopt;
}

}  // namespace lsm
