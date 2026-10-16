#pragma once

#include <functional>
#include <optional>
#include <string>

namespace lsm {

/// Decides which memtable key to drop when room is needed.
class EvictionPolicy {
 public:
  using EvictablePredicate = std::function<bool(const std::string&)>;

  virtual ~EvictionPolicy() = default;

  virtual std::string name() const = 0;
  virtual void record_insert(const std::string& key) = 0;
  virtual void record_access(const std::string& key) = 0;
  virtual void record_removal(const std::string& key) = 0;
  // Returns the key to evict among those `is_evictable` accepts, or nullopt if none qualifies.
  virtual std::optional<std::string> select_victim(const EvictablePredicate& is_evictable) const = 0;
};

}  // namespace lsm
