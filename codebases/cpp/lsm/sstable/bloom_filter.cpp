#include "lsm/sstable/bloom_filter.h"

#include <algorithm>
#include <cmath>
#include <utility>

namespace lsm {
namespace {

constexpr std::uint32_t kMinBits = 64;
constexpr std::uint32_t kMaxHashes = 8;
constexpr std::size_t kHeaderBytes = 4 + 1;

}  // namespace

BloomFilter::BloomFilter(std::uint32_t bit_count, std::uint32_t hash_count, Bytes bits,
                         std::shared_ptr<const BloomHasher> hasher)
    : bit_count_(bit_count), hash_count_(hash_count), bits_(std::move(bits)), hasher_(std::move(hasher)) {
  // A truncated filter reads its missing bits as unset rather than past the end of the buffer.
  bits_.resize(bit_count_ / 8, 0);
}

// NOTE: the size is fixed once built, but the false-positive rate rises as keys are added, so
// each table sizes its filter from its own key count instead of using one global size.
BloomFilter BloomFilter::for_entry_count(std::size_t entry_count, std::size_t bits_per_key,
                                         std::shared_ptr<const BloomHasher> hasher) {
  const std::size_t wanted = entry_count * bits_per_key;
  const auto bit_count = static_cast<std::uint32_t>(std::max<std::size_t>(kMinBits, (wanted + 7) / 8 * 8));
  const auto rounded = static_cast<std::uint32_t>(std::lround(static_cast<double>(bits_per_key) * std::log(2.0)));
  const std::uint32_t hash_count = std::min(kMaxHashes, std::max<std::uint32_t>(1, rounded));
  return BloomFilter(bit_count, hash_count, Bytes(bit_count / 8, 0), std::move(hasher));
}

BloomFilter BloomFilter::from_bytes(const Bytes& bytes, std::shared_ptr<const BloomHasher> hasher) {
  const std::uint32_t bit_count = read_u32_be(bytes, 0);
  const std::uint8_t hash_count = read_u8(bytes, 4);
  const std::size_t end = std::min(bytes.size(), kHeaderBytes + bit_count / 8);
  return BloomFilter(bit_count, hash_count, slice(bytes, kHeaderBytes, end), std::move(hasher));
}

void BloomFilter::add(const std::string& key) {
  for (const std::uint32_t position : positions_of(key)) {
    bits_[position >> 3] = static_cast<std::uint8_t>(bits_[position >> 3] | (1u << (position & 7)));
  }
}

bool BloomFilter::might_contain(const std::string& key) const {
  const std::vector<std::uint32_t> positions = positions_of(key);
  return std::all_of(positions.begin(), positions.end(), [this](std::uint32_t position) { return is_set(position); });
}

std::vector<std::uint32_t> BloomFilter::positions_of(const std::string& key) const {
  return hasher_->positions(key, bit_count_, hash_count_);
}

std::uint32_t BloomFilter::set_bit_count() const {
  std::uint32_t count = 0;
  for (std::uint32_t position = 0; position < bit_count_; ++position) {
    if (is_set(position)) ++count;
  }
  return count;
}

Bytes BloomFilter::to_bytes() const {
  Bytes bytes;
  bytes.reserve(kHeaderBytes + bits_.size());
  append_u32_be(bytes, bit_count_);
  append_u8(bytes, static_cast<std::uint8_t>(hash_count_));
  append_bytes(bytes, bits_);
  return bytes;
}

bool BloomFilter::is_set(std::uint32_t position) const { return (bits_[position >> 3] & (1u << (position & 7))) != 0; }

}  // namespace lsm
