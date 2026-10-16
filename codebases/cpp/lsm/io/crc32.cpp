#include "lsm/io/crc32.h"

#include <array>

namespace lsm {
namespace {

const std::array<std::uint32_t, 256>& crc_table() {
  static const std::array<std::uint32_t, 256> table = [] {
    std::array<std::uint32_t, 256> built{};
    for (std::uint32_t byte = 0; byte < 256; ++byte) {
      std::uint32_t crc = byte;
      for (int bit = 0; bit < 8; ++bit) crc = (crc & 1) != 0 ? 0xedb88320u ^ (crc >> 1) : crc >> 1;
      built[byte] = crc;
    }
    return built;
  }();
  return table;
}

}  // namespace

std::uint32_t crc32(const std::uint8_t* data, std::size_t size) {
  const auto& table = crc_table();
  std::uint32_t crc = 0xffffffffu;
  for (std::size_t i = 0; i < size; ++i) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >> 8);
  return crc ^ 0xffffffffu;
}

}  // namespace lsm
