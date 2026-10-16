#pragma once

#include <cstddef>
#include <string>

namespace lsm {

/// Tunable limits of the store.
struct StoreConfig {
  std::size_t wal_max_bytes;
  std::size_t block_size_bytes;
  std::size_t memtable_capacity;
  std::size_t compaction_trigger;
  std::size_t bloom_bits_per_key;
  std::string eviction_policy;
  std::string log_level;
};

inline const StoreConfig kDefaultConfig{4 * 1024 * 1024, 4096, 100'000, 4, 10, "lru", "info"};

// Deliberately tiny so the demo triggers flushes, evictions and compactions within a few writes.
inline const StoreConfig kDemoConfig{128, 64, 6, 3, 6, "lru", "debug"};

StoreConfig create_config(const StoreConfig& config = kDefaultConfig);

}  // namespace lsm
