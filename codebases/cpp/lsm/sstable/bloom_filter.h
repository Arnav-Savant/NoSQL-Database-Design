#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include "lsm/io/big_endian.h"
#include "lsm/sstable/bloom_hasher.h"

namespace lsm {

// Layout: u32 bitCount | u8 hashCount | ceil(bitCount / 8) bytes (bit p lives in byte p >> 3, mask 1 << (p & 7))
/// Probabilistic set membership: "definitely absent" is always right, "maybe present" can be wrong.
class BloomFilter {
 public:
  BloomFilter(std::uint32_t bit_count, std::uint32_t hash_count, Bytes bits,
              std::shared_ptr<const BloomHasher> hasher);

  static BloomFilter for_entry_count(std::size_t entry_count, std::size_t bits_per_key,
                                     std::shared_ptr<const BloomHasher> hasher);
  static BloomFilter from_bytes(const Bytes& bytes, std::shared_ptr<const BloomHasher> hasher);

  std::uint32_t bit_count() const { return bit_count_; }
  std::uint32_t hash_count() const { return hash_count_; }

  void add(const std::string& key);
  bool might_contain(const std::string& key) const;
  std::vector<std::uint32_t> positions_of(const std::string& key) const;
  std::uint32_t set_bit_count() const;
  Bytes to_bytes() const;

 private:
  bool is_set(std::uint32_t position) const;

  std::uint32_t bit_count_;
  std::uint32_t hash_count_;
  Bytes bits_;
  std::shared_ptr<const BloomHasher> hasher_;
};

}  // namespace lsm
