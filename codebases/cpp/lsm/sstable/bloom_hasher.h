#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace lsm {

/// Derives k bit positions from two FNV-1a hashes of the key (double hashing).
class BloomHasher {
 public:
  std::vector<std::uint32_t> positions(const std::string& key, std::uint32_t bit_count,
                                       std::uint32_t hash_count) const;
};

}  // namespace lsm
