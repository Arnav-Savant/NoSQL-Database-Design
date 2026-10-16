#include "lsm/config/store_config.h"

#include <stdexcept>
#include <utility>
#include <vector>

namespace lsm {

StoreConfig create_config(const StoreConfig& config) {
  const std::vector<std::pair<const char*, std::size_t>> fields{
      {"wal_max_bytes", config.wal_max_bytes},
      {"block_size_bytes", config.block_size_bytes},
      {"memtable_capacity", config.memtable_capacity},
      {"compaction_trigger", config.compaction_trigger},
      {"bloom_bits_per_key", config.bloom_bits_per_key},
  };
  for (const auto& [field, value] : fields) {
    if (value < 1) {
      throw std::invalid_argument(std::string("Config field \"") + field + "\" must be a positive integer, got " +
                                  std::to_string(value) + ".");
    }
  }
  if (config.compaction_trigger < 2) {
    throw std::invalid_argument(
        "Config field \"compaction_trigger\" must be at least 2, because a merge needs two tables.");
  }
  return config;
}

}  // namespace lsm
