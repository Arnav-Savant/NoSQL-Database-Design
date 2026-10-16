#pragma once

#include <memory>
#include <string>
#include <vector>

#include "lsm/config/store_config.h"
#include "lsm/entry/entry.h"
#include "lsm/io/storage_directory.h"
#include "lsm/logging/logger.h"
#include "lsm/sstable/bloom_filter.h"
#include "lsm/sstable/bloom_hasher.h"
#include "lsm/sstable/sparse_index.h"
#include "lsm/sstable/table_range.h"

namespace lsm {

/// Writes sorted entries as an immutable SSTable file.
class SSTableWriter {
 public:
  SSTableWriter(std::shared_ptr<const StorageDirectory> directory, StoreConfig config,
                std::shared_ptr<const BloomHasher> hasher, std::shared_ptr<Logger> logger);

  // Entries must already be sorted by key with one entry per key. Returns the file name.
  std::string write(const TableRange& range, const std::vector<Entry>& entries) const;

 private:
  struct PackedBlocks {
    Bytes data_bytes;
    std::vector<BlockHandle> blocks;
  };

  PackedBlocks pack_blocks(const std::vector<Entry>& entries, BloomFilter& bloom) const;

  std::shared_ptr<const StorageDirectory> directory_;
  StoreConfig config_;
  std::shared_ptr<const BloomHasher> hasher_;
  std::shared_ptr<Logger> logger_;
};

}  // namespace lsm
