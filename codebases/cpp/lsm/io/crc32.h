#pragma once

#include <cstddef>
#include <cstdint>

#include "lsm/io/big_endian.h"

namespace lsm {

// CRC-32 (IEEE 802.3, reflected polynomial 0xEDB88320). Each WAL record stores the checksum of
// its payload so recovery can tell a complete record from one torn by a crash mid-write.
std::uint32_t crc32(const std::uint8_t* data, std::size_t size);

inline std::uint32_t crc32(const Bytes& bytes) { return crc32(bytes.data(), bytes.size()); }

}  // namespace lsm
