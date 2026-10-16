#include "lsm/memtable/eviction/lru_eviction_policy.h"

namespace lsm {

void LruEvictionPolicy::record_insert(const std::string& key) { record_access(key); }

// Moving the key to the back on every use keeps the oldest use at the front.
void LruEvictionPolicy::record_access(const std::string& key) {
  record_removal(key);
  positions_[key] = recency_.insert(recency_.end(), key);
}

void LruEvictionPolicy::record_removal(const std::string& key) {
  const auto found = positions_.find(key);
  if (found == positions_.end()) return;
  recency_.erase(found->second);
  positions_.erase(found);
}

std::optional<std::string> LruEvictionPolicy::select_victim(const EvictablePredicate& is_evictable) const {
  for (const std::string& key : recency_) {
    if (is_evictable(key)) return key;
  }
  return std::nullopt;
}

}  // namespace lsm
