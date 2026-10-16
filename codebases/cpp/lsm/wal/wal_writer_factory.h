#pragma once

#include <cstdint>
#include <memory>

#include "lsm/io/storage_directory.h"
#include "lsm/logging/logger.h"
#include "lsm/wal/wal_writer.h"

namespace lsm {

/// Opens the write-ahead log for a given sequence number, creating the file if needed.
class WalWriterFactory {
 public:
  WalWriterFactory(std::shared_ptr<const StorageDirectory> directory, std::shared_ptr<Logger> logger);

  std::unique_ptr<WalWriter> open(std::uint64_t sequence) const;

 private:
  std::shared_ptr<const StorageDirectory> directory_;
  std::shared_ptr<Logger> logger_;
};

}  // namespace lsm
