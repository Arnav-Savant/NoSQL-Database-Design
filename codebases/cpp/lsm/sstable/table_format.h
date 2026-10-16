#pragma once

#include <cstddef>
#include <cstdint>

namespace lsm {

// SSTable file layout:
//
//   data blocks   entries sorted by key, packed into blocks of at most block_size_bytes
//   sparse index  first key, offset and length of every block
//   bloom filter  bits for every key in the table
//   footer        u32 indexOffset | u32 bloomOffset | u32 entryCount | u32 magic, 16 bytes in total
inline constexpr std::size_t kFooterBytes = 16;
inline constexpr std::uint32_t kTableMagic = 0x4c534d31;  // "LSM1"

}  // namespace lsm
