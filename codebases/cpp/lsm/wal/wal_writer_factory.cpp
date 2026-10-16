#include "lsm/wal/wal_writer_factory.h"

#include <string>
#include <utility>

namespace lsm {

WalWriterFactory::WalWriterFactory(std::shared_ptr<const StorageDirectory> directory, std::shared_ptr<Logger> logger)
    : directory_(std::move(directory)), logger_(std::move(logger)) {}

std::unique_ptr<WalWriter> WalWriterFactory::open(std::uint64_t sequence) const {
  auto writer = std::make_unique<WalWriter>(directory_, sequence, logger_);
  logger_->info("Wal", "opened", {{"wal", writer->name()}, {"walBytes", std::to_string(writer->size_bytes())}});
  return writer;
}

}  // namespace lsm
