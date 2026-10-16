#include "lsm/sstable/sstable_reader_factory.h"

#include <utility>

namespace lsm {

SSTableReaderFactory::SSTableReaderFactory(std::shared_ptr<const StorageDirectory> directory,
                                           std::shared_ptr<const BloomHasher> hasher, std::shared_ptr<Logger> logger)
    : directory_(std::move(directory)), hasher_(std::move(hasher)), logger_(std::move(logger)) {}

std::shared_ptr<SSTableReader> SSTableReaderFactory::open(const std::string& name) const {
  return SSTableReader::open(directory_, name, hasher_, logger_);
}

}  // namespace lsm
