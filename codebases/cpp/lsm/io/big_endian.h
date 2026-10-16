#pragma once

#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>

namespace lsm {

using Bytes = std::vector<std::uint8_t>;

// Every multi-byte integer in the file formats is big-endian, whatever the host byte order.

inline void require_bytes(const Bytes& bytes, std::size_t offset, std::size_t length) {
  if (offset > bytes.size() || length > bytes.size() - offset) {
    throw std::out_of_range("Read of " + std::to_string(length) + " bytes at offset " + std::to_string(offset) +
                            " is outside a buffer of " + std::to_string(bytes.size()) + " bytes.");
  }
}

inline std::uint8_t read_u8(const Bytes& bytes, std::size_t offset) {
  require_bytes(bytes, offset, 1);
  return bytes[offset];
}

inline std::uint16_t read_u16_be(const Bytes& bytes, std::size_t offset) {
  require_bytes(bytes, offset, 2);
  return static_cast<std::uint16_t>((bytes[offset] << 8) | bytes[offset + 1]);
}

inline std::uint32_t read_u32_be(const Bytes& bytes, std::size_t offset) {
  require_bytes(bytes, offset, 4);
  return (static_cast<std::uint32_t>(bytes[offset]) << 24) | (static_cast<std::uint32_t>(bytes[offset + 1]) << 16) |
         (static_cast<std::uint32_t>(bytes[offset + 2]) << 8) | static_cast<std::uint32_t>(bytes[offset + 3]);
}

inline double read_f64_be(const Bytes& bytes, std::size_t offset) {
  require_bytes(bytes, offset, 8);
  std::uint64_t bits = 0;
  for (std::size_t i = 0; i < 8; ++i) bits = (bits << 8) | bytes[offset + i];
  double number = 0;
  std::memcpy(&number, &bits, sizeof number);
  return number;
}

inline std::string read_text(const Bytes& bytes, std::size_t offset, std::size_t length) {
  require_bytes(bytes, offset, length);
  return std::string(bytes.begin() + static_cast<std::ptrdiff_t>(offset),
                     bytes.begin() + static_cast<std::ptrdiff_t>(offset + length));
}

inline Bytes slice(const Bytes& bytes, std::size_t start, std::size_t end) {
  require_bytes(bytes, start, end - start);
  return Bytes(bytes.begin() + static_cast<std::ptrdiff_t>(start), bytes.begin() + static_cast<std::ptrdiff_t>(end));
}

inline void append_u8(Bytes& bytes, std::uint8_t value) { bytes.push_back(value); }

inline void append_u16_be(Bytes& bytes, std::uint16_t value) {
  bytes.push_back(static_cast<std::uint8_t>(value >> 8));
  bytes.push_back(static_cast<std::uint8_t>(value));
}

inline void append_u32_be(Bytes& bytes, std::uint32_t value) {
  for (int shift = 24; shift >= 0; shift -= 8) bytes.push_back(static_cast<std::uint8_t>(value >> shift));
}

inline void append_f64_be(Bytes& bytes, double number) {
  std::uint64_t bits = 0;
  std::memcpy(&bits, &number, sizeof bits);
  for (int shift = 56; shift >= 0; shift -= 8) bytes.push_back(static_cast<std::uint8_t>(bits >> shift));
}

inline void append_text(Bytes& bytes, const std::string& text) { bytes.insert(bytes.end(), text.begin(), text.end()); }

inline void append_bytes(Bytes& bytes, const Bytes& more) { bytes.insert(bytes.end(), more.begin(), more.end()); }

}  // namespace lsm
