#include "lsm/sstable/sparse_index.h"

#include <utility>

#include "lsm/entry/key_order.h"

namespace lsm {

SparseIndex::SparseIndex(std::vector<BlockHandle> blocks) : blocks_(std::move(blocks)) {}

SparseIndex SparseIndex::from_bytes(const Bytes& bytes) {
  std::vector<BlockHandle> blocks;
  std::size_t offset = 4;
  const std::uint32_t block_count = read_u32_be(bytes, 0);
  for (std::uint32_t i = 0; i < block_count; ++i) {
    const std::uint16_t key_length = read_u16_be(bytes, offset);
    offset += 2;
    std::string first_key = read_text(bytes, offset, key_length);
    offset += key_length;
    const std::uint32_t block_offset = read_u32_be(bytes, offset);
    const std::uint32_t length = read_u32_be(bytes, offset + 4);
    offset += 8;
    blocks.push_back(BlockHandle{std::move(first_key), block_offset, length});
  }
  return SparseIndex(std::move(blocks));
}

std::optional<LocatedBlock> SparseIndex::locate(const std::string& key) const {
  std::ptrdiff_t low = 0;
  std::ptrdiff_t high = static_cast<std::ptrdiff_t>(blocks_.size()) - 1;
  std::ptrdiff_t found = -1;
  while (low <= high) {
    const std::ptrdiff_t middle = (low + high) / 2;
    if (compare_keys(blocks_[static_cast<std::size_t>(middle)].first_key, key) <= 0) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found == -1) return std::nullopt;
  const auto index = static_cast<std::size_t>(found);
  return LocatedBlock{index, blocks_[index]};
}

Bytes SparseIndex::to_bytes() const {
  Bytes bytes;
  append_u32_be(bytes, static_cast<std::uint32_t>(blocks_.size()));
  for (const BlockHandle& block : blocks_) {
    append_u16_be(bytes, static_cast<std::uint16_t>(block.first_key.size()));
    append_text(bytes, block.first_key);
    append_u32_be(bytes, block.offset);
    append_u32_be(bytes, block.length);
  }
  return bytes;
}

}  // namespace lsm
