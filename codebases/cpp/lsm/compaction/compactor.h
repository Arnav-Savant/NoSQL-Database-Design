#pragma once

#include <memory>
#include <vector>

#include "lsm/compaction/compaction_strategy.h"
#include "lsm/compaction/entry_merger.h"
#include "lsm/io/storage_directory.h"
#include "lsm/logging/logger.h"
#include "lsm/sstable/sstable_reader_factory.h"
#include "lsm/sstable/sstable_writer.h"

namespace lsm {

/// Merges tables chosen by the strategy until no merge is due.
class Compactor {
 public:
  Compactor(std::unique_ptr<CompactionStrategy> strategy, std::unique_ptr<EntryMerger> merger,
            std::shared_ptr<const SSTableWriter> writer, std::shared_ptr<const SSTableReaderFactory> reader_factory,
            std::shared_ptr<const StorageDirectory> directory, std::shared_ptr<Logger> logger);

  // Returns the new set of live tables, oldest first.
  std::vector<TablePtr> compact_until_stable(const std::vector<TablePtr>& tables) const;

 private:
  TablePtr merge(const TablePtr& older, const TablePtr& newer, const std::vector<TablePtr>& live) const;

  std::unique_ptr<CompactionStrategy> strategy_;
  std::unique_ptr<EntryMerger> merger_;
  std::shared_ptr<const SSTableWriter> writer_;
  std::shared_ptr<const SSTableReaderFactory> reader_factory_;
  std::shared_ptr<const StorageDirectory> directory_;
  std::shared_ptr<Logger> logger_;
};

}  // namespace lsm
