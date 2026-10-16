#include "demo/state_printer.h"

#include <algorithm>
#include <array>
#include <cstdio>
#include <string>
#include <utility>

namespace demo {
namespace {

constexpr std::array<const char*, 5> kValueTypeNames{"null", "boolean", "number", "string", "tombstone"};
const std::string kIndent(15, ' ');

std::string hex(const lsm::Bytes& bytes, std::size_t start, std::size_t end) {
  std::string text;
  for (std::size_t i = start; i < end; ++i) {
    std::array<char, 4> digits{};
    std::snprintf(digits.data(), digits.size(), "%02x", bytes.at(i));
    if (!text.empty()) text += ' ';
    text += digits.data();
  }
  return text;
}

}  // namespace

StatePrinter::StatePrinter(std::shared_ptr<const Narrator> narrator) : narrator_(std::move(narrator)) {}

void StatePrinter::print_snapshot(const lsm::StoreSnapshot& snapshot) const {
  const auto& wal = snapshot.active_wal;
  const auto& memtable = snapshot.memtable;
  const auto dirty = std::count_if(memtable.rows.begin(), memtable.rows.end(),
                                   [](const lsm::MemtableRow& row) { return row.state == "dirty"; });
  const auto out = [this](const std::string& text) { narrator_->line(text); };

  out("");
  out("  Active WAL   " + wal.name + "  " + std::to_string(wal.size_bytes) + " bytes, " + std::to_string(wal.records) +
      " records appended since opened");
  out("  Memtable     " + std::to_string(memtable.rows.size()) + " of " + std::to_string(memtable.capacity) +
      " slots used, " + std::to_string(dirty) + " dirty");
  if (!memtable.rows.empty()) {
    std::size_t key_width = 3;
    std::size_t value_width = 5;
    for (const lsm::MemtableRow& row : memtable.rows) {
      key_width = std::max(key_width, display_width(row.key));
      value_width = std::max(value_width, display_width(row.value));
    }
    out(kIndent + pad_end("key", key_width) + "  " + pad_end("value", value_width) + "  state");
    for (const lsm::MemtableRow& row : memtable.rows) {
      out(kIndent + pad_end(row.key, key_width) + "  " + pad_end(row.value, value_width) + "  " + row.state);
    }
  }
  if (snapshot.tables.empty()) {
    out("  SSTables     none yet");
    return;
  }
  out("  SSTables     newest first");
  for (const lsm::TableDescription& table : snapshot.tables) {
    out(kIndent + table.name + "  " + std::to_string(table.entry_count) + " entries, " +
        std::to_string(table.blocks.size()) + " blocks, bloom " + std::to_string(table.bloom.set_bits) + " of " +
        std::to_string(table.bloom.bit_count) + " bits set (k=" + std::to_string(table.bloom.hash_count) + ")");
    for (std::size_t index = 0; index < table.blocks.size(); ++index) {
      const lsm::BlockHandle& block = table.blocks[index];
      out("                 block " + std::to_string(index + 1) + "  offset " +
          pad_start(std::to_string(block.offset), 3) + "  " + pad_start(std::to_string(block.length), 3) +
          " bytes  first key " + block.first_key);
    }
  }
}

void StatePrinter::print_wal_record(const lsm::Bytes& record_bytes) const {
  const std::uint32_t payload_length = lsm::read_u32_be(record_bytes, 4);
  const std::uint16_t key_length = lsm::read_u16_be(record_bytes, 8);
  const std::size_t key_end = 10 + static_cast<std::size_t>(key_length);
  const std::uint8_t value_type = lsm::read_u8(record_bytes, key_end);
  const std::uint32_t value_length = lsm::read_u32_be(record_bytes, key_end + 1);
  const std::size_t value_start = key_end + 5;
  const auto out = [this](const std::string& text) { narrator_->line(text); };

  out("");
  out("  checksum      " + hex(record_bytes, 0, 4));
  out("  length        " + hex(record_bytes, 4, 8) + "   payload is " + std::to_string(payload_length) + " bytes");
  out("  key length    " + hex(record_bytes, 8, 10));
  out("  key           " + hex(record_bytes, 10, key_end) + "   \"" + lsm::read_text(record_bytes, 10, key_length) + "\"");
  out("  value type    " + hex(record_bytes, key_end, key_end + 1) + "   " +
      (value_type < kValueTypeNames.size() ? kValueTypeNames[value_type] : "undefined"));
  out("  value length  " + hex(record_bytes, key_end + 1, value_start));
  out("  value         " + hex(record_bytes, value_start, value_start + value_length) + "   8-byte IEEE-754 double");
}

}  // namespace demo
