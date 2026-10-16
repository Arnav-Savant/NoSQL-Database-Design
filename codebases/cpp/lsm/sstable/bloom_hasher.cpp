#include "lsm/sstable/bloom_hasher.h"

namespace lsm {
namespace {

constexpr std::uint32_t kFnvOffsetBasis = 0x811c9dc5u;
constexpr std::uint32_t kFnvPrime = 0x01000193u;
constexpr std::uint32_t kSecondHashSeed = 0x5bd1e995u;

std::uint32_t fnv1a32(const std::string& bytes, std::uint32_t seed) {
  std::uint32_t hash = seed;
  for (const char byte : bytes) {
    hash ^= static_cast<unsigned char>(byte);
    hash *= kFnvPrime;
  }
  return hash;
}

}  // namespace

std::vector<std::uint32_t> BloomHasher::positions(const std::string& key, std::uint32_t bit_count,
                                                  std::uint32_t hash_count) const {
  const std::uint64_t first = fnv1a32(key, kFnvOffsetBasis);
  // An odd step keeps the k probes from collapsing onto the same bit.
  const std::uint64_t second = fnv1a32(key, kFnvOffsetBasis ^ kSecondHashSeed) | 1u;
  std::vector<std::uint32_t> positions;
  positions.reserve(hash_count);
  for (std::uint64_t i = 0; i < hash_count; ++i) {
    positions.push_back(static_cast<std::uint32_t>((first + i * second) % bit_count));
  }
  return positions;
}

}  // namespace lsm
