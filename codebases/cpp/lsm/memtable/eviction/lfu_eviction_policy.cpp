#include "lsm/memtable/eviction/lfu_eviction_policy.h"

namespace lsm {

void LfuEvictionPolicy::record_insert(const std::string& key) { usage_[key] = Usage{1, next_insert_++}; }

void LfuEvictionPolicy::record_access(const std::string& key) {
  const auto found = usage_.find(key);
  if (found == usage_.end()) {
    record_insert(key);
    return;
  }
  found->second.uses += 1;
}

void LfuEvictionPolicy::record_removal(const std::string& key) { usage_.erase(key); }

// Insert orders are unique, so the winner does not depend on the order keys are visited in.
std::optional<std::string> LfuEvictionPolicy::select_victim(const EvictablePredicate& is_evictable) const {
  const std::pair<const std::string, Usage>* victim = nullptr;
  for (const auto& candidate : usage_) {
    if (!is_evictable(candidate.first)) continue;
    const Usage& usage = candidate.second;
    const bool fewer_uses = victim == nullptr || usage.uses < victim->second.uses;
    const bool older_tie =
        victim != nullptr && usage.uses == victim->second.uses && usage.insert_order < victim->second.insert_order;
    if (fewer_uses || older_tie) victim = &candidate;
  }
  if (victim == nullptr) return std::nullopt;
  return victim->first;
}

}  // namespace lsm
