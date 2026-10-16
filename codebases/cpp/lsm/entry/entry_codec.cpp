#include "lsm/entry/entry_codec.h"

#include <algorithm>
#include <stdexcept>
#include <string>

namespace lsm {
namespace {

constexpr std::size_t kMaxKeyBytes = 0xffff;
constexpr std::size_t kHeaderBytes = 2 + 1 + 4;

Bytes encode_value(const Value& value) {
  Bytes bytes;
  switch (value.type()) {
    case ValueType::kNull:
    case ValueType::kTombstone:
      break;
    case ValueType::kBoolean:
      append_u8(bytes, value.as_boolean() ? 1 : 0);
      break;
    case ValueType::kNumber:
      append_f64_be(bytes, value.as_number());
      break;
    case ValueType::kString:
      append_text(bytes, value.as_string());
      break;
    default:
      throw std::invalid_argument("Unknown value type " + std::to_string(static_cast<int>(value.type())) + ".");
  }
  return bytes;
}

Value decode_value(std::uint8_t type, const Bytes& bytes) {
  switch (static_cast<ValueType>(type)) {
    case ValueType::kNull:
      return Value::null();
    case ValueType::kTombstone:
      return Value::tombstone();
    case ValueType::kBoolean:
      return Value::boolean(!bytes.empty() && bytes[0] == 1);
    case ValueType::kNumber:
      return Value::number(read_f64_be(bytes, 0));
    case ValueType::kString:
      return Value::string(std::string(bytes.begin(), bytes.end()));
    default:
      throw std::runtime_error("Unknown value type " + std::to_string(type) + " on disk.");
  }
}

// Cuts at a character boundary so the error message stays valid UTF-8.
std::string key_preview(const std::string& key) {
  std::size_t cut = std::min<std::size_t>(key.size(), 20);
  while (cut > 0 && cut < key.size() && (static_cast<unsigned char>(key[cut]) & 0xc0) == 0x80) --cut;
  return key.substr(0, cut);
}

}  // namespace

Bytes EntryCodec::encode(const Entry& entry) {
  const std::string& key = entry.key();
  if (key.size() > kMaxKeyBytes) {
    throw std::invalid_argument("Key \"" + key_preview(key) + "…\" exceeds " + std::to_string(kMaxKeyBytes) +
                                " bytes.");
  }
  const Bytes value_bytes = encode_value(entry.value());

  Bytes buffer;
  buffer.reserve(kHeaderBytes + key.size() + value_bytes.size());
  append_u16_be(buffer, static_cast<std::uint16_t>(key.size()));
  append_text(buffer, key);
  append_u8(buffer, static_cast<std::uint8_t>(entry.value().type()));
  append_u32_be(buffer, static_cast<std::uint32_t>(value_bytes.size()));
  append_bytes(buffer, value_bytes);
  return buffer;
}

DecodedEntry EntryCodec::decode(const Bytes& buffer, std::size_t start) {
  std::size_t offset = start;
  const std::uint16_t key_length = read_u16_be(buffer, offset);
  offset += 2;
  std::string key = read_text(buffer, offset, key_length);
  offset += key_length;
  const std::uint8_t type = read_u8(buffer, offset);
  offset += 1;
  const std::uint32_t value_length = read_u32_be(buffer, offset);
  offset += 4;
  if (offset + value_length > buffer.size()) throw std::out_of_range("Entry extends past the end of the buffer.");
  Value value = decode_value(type, slice(buffer, offset, offset + value_length));
  offset += value_length;
  return DecodedEntry{Entry(std::move(key), std::move(value)), offset - start};
}

std::vector<Entry> EntryCodec::decode_all(const Bytes& buffer) {
  std::vector<Entry> entries;
  for (std::size_t offset = 0; offset < buffer.size();) {
    DecodedEntry decoded = decode(buffer, offset);
    offset += decoded.bytes_read;
    entries.push_back(std::move(decoded.entry));
  }
  return entries;
}

}  // namespace lsm
