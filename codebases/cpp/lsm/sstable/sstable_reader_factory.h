#pragma once

#include <memory>
#include <string>

#include "lsm/io/storage_directory.h"
#include "lsm/logging/logger.h"
#include "lsm/sstable/bloom_hasher.h"
#include "lsm/sstable/sstable_reader.h"

namespace lsm {

/// Opens SSTables by file name with the store's shared hasher and logger.
class SSTableReaderFactory {
 public:
  SSTableReaderFactory(std::shared_ptr<const StorageDirectory> directory, std::shared_ptr<const BloomHasher> hasher,
                       std::shared_ptr<Logger> logger);

  std::shared_ptr<SSTableReader> open(const std::string& name) const;

 private:
  std::shared_ptr<const StorageDirectory> directory_;
  std::shared_ptr<const BloomHasher> hasher_;
  std::shared_ptr<Logger> logger_;
};

}  // namespace lsm
