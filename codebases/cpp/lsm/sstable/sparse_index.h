#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "lsm/io/big_endian.h"

namespace lsm {

struct BlockHandle {
  std::string first_key;
  std::uint32_t offset;
  std::uint32_t length;
};

struct LocatedBlock {
  std::size_t index;
  BlockHandle block;
};

// Layout: u32 blockCount | per block: u16 keyLength | first key | u32 offset | u32 length
/// One entry per data block: the block's first key, where it starts, and how long it is.
class SparseIndex {
 public:
  explicit SparseIndex(std::vector<BlockHandle> blocks);

  static SparseIndex from_bytes(const Bytes& bytes);

  const std::vector<BlockHandle>& blocks() const { return blocks_; }

  // The only block that can hold `key`: the last one whose first key is <= key.
  std::optional<LocatedBlock> locate(const std::string& key) const;
  Bytes to_bytes() const;

 private:
  std::vector<BlockHandle> blocks_;
};

}  // namespace lsm
