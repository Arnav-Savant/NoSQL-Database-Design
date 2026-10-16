#include "lsm/recovery/recovery_manager.h"

#include <algorithm>
#include <optional>
#include <utility>

#include "lsm/io/file_names.h"
#include "lsm/wal/wal_reader.h"

namespace lsm {

RecoveryManager::RecoveryManager(std::shared_ptr<const StorageDirectory> directory,
                                 std::shared_ptr<const SSTableReaderFactory> reader_factory,
                                 std::shared_ptr<Logger> logger)
    : directory_(std::move(directory)), reader_factory_(std::move(reader_factory)), logger_(std::move(logger)) {}

RecoveredState RecoveryManager::recover() const {
  remove_temporary_files();
  std::vector<TablePtr> tables = open_tables(remove_superseded_tables());
  std::uint64_t highest_flushed_sequence = 0;
  for (const TablePtr& table : tables) highest_flushed_sequence = std::max(highest_flushed_sequence, table->range().max());
  std::vector<RecoveredWal> wals = replay_unflushed_wals(highest_flushed_sequence);
  return RecoveredState{std::move(tables), std::move(wals)};
}

// A *.tmp file is a flush or merge that never reached its rename; its source data still exists.
void RecoveryManager::remove_temporary_files() const {
  for (const std::string& name : directory_->list()) {
    if (!is_temp_file_name(name)) continue;
    directory_->remove(name);
    logger_->warn("Recovery", "removed unfinished temporary file", {{"file", name}});
  }
}

// A table whose range lies inside another's is the input of a merge that finished writing its
// output but crashed before deleting the inputs. The output already holds all of its data.
std::vector<RecoveryManager::NamedTable> RecoveryManager::remove_superseded_tables() const {
  std::vector<NamedTable> named;
  for (const std::string& name : directory_->list()) {
    if (const std::optional<TableRange> range = parse_table_file_name(name)) named.push_back(NamedTable{name, *range});
  }
  std::vector<NamedTable> survivors;
  for (const NamedTable& table : named) {
    const auto container = std::find_if(named.begin(), named.end(), [&](const NamedTable& other) {
      return other.range.strictly_contains(table.range);
    });
    if (container != named.end()) {
      directory_->remove(table.name);
      logger_->warn("Recovery", "removed table superseded by a finished merge",
                    {{"table", table.name}, {"mergedInto", container->name}});
    } else {
      survivors.push_back(table);
    }
  }
  return survivors;
}

std::vector<TablePtr> RecoveryManager::open_tables(std::vector<NamedTable> named_tables) const {
  std::stable_sort(named_tables.begin(), named_tables.end(),
                   [](const NamedTable& left, const NamedTable& right) { return left.range.max() < right.range.max(); });
  std::vector<TablePtr> tables;
  for (const NamedTable& table : named_tables) tables.push_back(reader_factory_->open(table.name));
  for (const TablePtr& table : tables) {
    logger_->info("Recovery", "opened table",
                  {{"table", table->name()},
                   {"entries", std::to_string(table->entry_count())},
                   {"blocks", std::to_string(table->sparse_index().blocks().size())}});
  }
  return tables;
}

std::vector<RecoveredWal> RecoveryManager::replay_unflushed_wals(std::uint64_t highest_flushed_sequence) const {
  std::vector<std::pair<std::string, std::uint64_t>> wals;
  for (const std::string& name : directory_->list()) {
    if (const std::optional<std::uint64_t> sequence = parse_wal_file_name(name)) wals.emplace_back(name, *sequence);
  }
  std::stable_sort(wals.begin(), wals.end(), [](const auto& left, const auto& right) { return left.second < right.second; });

  std::vector<RecoveredWal> replayed;
  for (const auto& [name, sequence] : wals) {
    // Already flushed: the crash happened after its SSTable was written but before it was deleted.
    if (sequence <= highest_flushed_sequence) {
      directory_->remove(name);
      logger_->info("Recovery", "removed WAL already covered by a table", {{"wal", name}});
      continue;
    }
    WalReplay replay = WalReader::replay(*directory_, name);
    if (replay.torn_bytes > 0) {
      directory_->truncate(name, replay.last_good_offset);
      logger_->warn("Recovery", "torn WAL tail truncated",
                    {{"wal", name},
                     {"keptBytes", std::to_string(replay.last_good_offset)},
                     {"droppedBytes", std::to_string(replay.torn_bytes)}});
    }
    logger_->info("Recovery", "replayed WAL", {{"wal", name}, {"records", std::to_string(replay.entries.size())}});
    replayed.push_back(RecoveredWal{name, sequence, std::move(replay.entries)});
  }
  return replayed;
}

}  // namespace lsm
