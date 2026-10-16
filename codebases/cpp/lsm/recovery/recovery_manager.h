#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include "lsm/entry/entry.h"
#include "lsm/io/storage_directory.h"
#include "lsm/logging/logger.h"
#include "lsm/sstable/sstable_reader.h"
#include "lsm/sstable/sstable_reader_factory.h"
#include "lsm/sstable/table_range.h"

namespace lsm {

struct RecoveredWal {
  std::string name;
  std::uint64_t sequence;
  std::vector<Entry> entries;
};

struct RecoveredState {
  std::vector<TablePtr> tables;
  std::vector<RecoveredWal> wals;
};

/// Brings the data directory back to a consistent state after a clean shutdown or a crash.
class RecoveryManager {
 public:
  RecoveryManager(std::shared_ptr<const StorageDirectory> directory,
                  std::shared_ptr<const SSTableReaderFactory> reader_factory, std::shared_ptr<Logger> logger);

  // Returns the live tables (oldest first) and the replayed, not-yet-flushed WALs (oldest first).
  RecoveredState recover() const;

 private:
  struct NamedTable {
    std::string name;
    TableRange range;
  };

  void remove_temporary_files() const;
  std::vector<NamedTable> remove_superseded_tables() const;
  std::vector<TablePtr> open_tables(std::vector<NamedTable> named_tables) const;
  std::vector<RecoveredWal> replay_unflushed_wals(std::uint64_t highest_flushed_sequence) const;

  std::shared_ptr<const StorageDirectory> directory_;
  std::shared_ptr<const SSTableReaderFactory> reader_factory_;
  std::shared_ptr<Logger> logger_;
};

}  // namespace lsm
