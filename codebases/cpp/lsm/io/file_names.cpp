#include "lsm/io/file_names.h"

#include <regex>

namespace lsm {
namespace {

constexpr std::size_t kSequenceDigits = 6;

const std::regex& wal_pattern() {
  static const std::regex pattern(R"(^wal-(\d{6})\.log$)");
  return pattern;
}

const std::regex& table_pattern() {
  static const std::regex pattern(R"(^sst-(\d{6})-(\d{6})\.sst$)");
  return pattern;
}

std::string pad(std::uint64_t sequence) {
  const std::string digits = std::to_string(sequence);
  return digits.size() >= kSequenceDigits ? digits : std::string(kSequenceDigits - digits.size(), '0') + digits;
}

}  // namespace

std::string wal_file_name(std::uint64_t sequence) { return "wal-" + pad(sequence) + ".log"; }

std::string table_file_name(const TableRange& range) {
  return "sst-" + pad(range.min()) + "-" + pad(range.max()) + ".sst";
}

std::optional<std::uint64_t> parse_wal_file_name(const std::string& name) {
  std::smatch match;
  if (!std::regex_match(name, match, wal_pattern())) return std::nullopt;
  return std::stoull(match[1].str());
}

std::optional<TableRange> parse_table_file_name(const std::string& name) {
  std::smatch match;
  if (!std::regex_match(name, match, table_pattern())) return std::nullopt;
  return TableRange(std::stoull(match[1].str()), std::stoull(match[2].str()));
}

bool is_temp_file_name(const std::string& name) {
  const std::string suffix = kTempSuffix;
  return name.size() >= suffix.size() && name.compare(name.size() - suffix.size(), suffix.size(), suffix) == 0;
}

}  // namespace lsm
