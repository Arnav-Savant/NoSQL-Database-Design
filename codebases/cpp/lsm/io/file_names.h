#pragma once

#include <cstdint>
#include <optional>
#include <string>

#include "lsm/sstable/table_range.h"

namespace lsm {

inline constexpr const char* kTempSuffix = ".tmp";

std::string wal_file_name(std::uint64_t sequence);
std::string table_file_name(const TableRange& range);
std::optional<std::uint64_t> parse_wal_file_name(const std::string& name);
std::optional<TableRange> parse_table_file_name(const std::string& name);
bool is_temp_file_name(const std::string& name);

}  // namespace lsm
