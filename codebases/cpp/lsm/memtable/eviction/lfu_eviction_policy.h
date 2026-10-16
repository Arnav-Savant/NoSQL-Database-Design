#pragma once

#include <cstdint>
#include <map>
#include <string>

#include "lsm/memtable/eviction/eviction_policy.h"

namespace lsm {

/// Least frequently used: the key with the fewest uses goes first; ties go to the oldest insert.
class LfuEvictionPolicy : public EvictionPolicy {
 public:
  std::string name() const override { return "lfu"; }
  void record_insert(const std::string& key) override;
  void record_access(const std::string& key) override;
  void record_removal(const std::string& key) override;
  std::optional<std::string> select_victim(const EvictablePredicate& is_evictable) const override;

 private:
  struct Usage {
    std::uint64_t uses;
    std::uint64_t insert_order;
  };

  std::map<std::string, Usage> usage_;
  std::uint64_t next_insert_ = 0;
};

}  // namespace lsm
