#pragma once

#include <list>
#include <string>
#include <unordered_map>

#include "lsm/memtable/eviction/eviction_policy.h"

namespace lsm {

/// First in, first out: the key inserted earliest goes first, regardless of use.
class FifoEvictionPolicy : public EvictionPolicy {
 public:
  std::string name() const override { return "fifo"; }
  void record_insert(const std::string& key) override;
  void record_access(const std::string& key) override;
  void record_removal(const std::string& key) override;
  std::optional<std::string> select_victim(const EvictablePredicate& is_evictable) const override;

 private:
  // The list keeps arrival order; the map finds a key's node in O(1).
  std::list<std::string> arrivals_;
  std::unordered_map<std::string, std::list<std::string>::iterator> positions_;
};

}  // namespace lsm
