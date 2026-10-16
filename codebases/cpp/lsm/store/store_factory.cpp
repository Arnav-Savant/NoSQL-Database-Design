#include "lsm/store/store_factory.h"

#include <functional>
#include <map>
#include <stdexcept>
#include <string>
#include <utility>

#include "lsm/compaction/compactor.h"
#include "lsm/compaction/entry_merger.h"
#include "lsm/compaction/oldest_pair_strategy.h"
#include "lsm/io/storage_directory.h"
#include "lsm/memtable/eviction/fifo_eviction_policy.h"
#include "lsm/memtable/eviction/lfu_eviction_policy.h"
#include "lsm/memtable/eviction/lru_eviction_policy.h"
#include "lsm/memtable/memtable.h"
#include "lsm/recovery/recovery_manager.h"
#include "lsm/sstable/bloom_hasher.h"
#include "lsm/sstable/sstable_reader_factory.h"
#include "lsm/sstable/sstable_writer.h"
#include "lsm/wal/wal_writer_factory.h"

namespace lsm {
namespace {

using PolicyMaker = std::function<std::unique_ptr<EvictionPolicy>()>;

const std::map<std::string, PolicyMaker>& eviction_policies() {
  static const std::map<std::string, PolicyMaker> policies{
      {"lru", [] { return std::make_unique<LruEvictionPolicy>(); }},
      {"lfu", [] { return std::make_unique<LfuEvictionPolicy>(); }},
      {"fifo", [] { return std::make_unique<FifoEvictionPolicy>(); }},
  };
  return policies;
}

}  // namespace

std::unique_ptr<LsmStore> StoreFactory::create(const StoreConfig& config, std::shared_ptr<Logger> logger,
                                               const std::filesystem::path& data_directory) {
  const auto create_policy = eviction_policies().find(config.eviction_policy);
  if (create_policy == eviction_policies().end()) {
    throw std::invalid_argument("Unknown eviction policy \"" + config.eviction_policy + "\". Use lru, lfu or fifo.");
  }

  auto directory = std::make_shared<const StorageDirectory>(data_directory);
  auto hasher = std::make_shared<const BloomHasher>();
  auto table_writer = std::make_shared<const SSTableWriter>(directory, config, hasher, logger);
  auto table_reader_factory = std::make_shared<const SSTableReaderFactory>(directory, hasher, logger);
  auto compactor = std::make_unique<Compactor>(std::make_unique<OldestPairStrategy>(config.compaction_trigger),
                                               std::make_unique<EntryMerger>(), table_writer, table_reader_factory,
                                               directory, logger);

  LsmStore::Dependencies dependencies{
      config,
      directory,
      logger,
      std::make_unique<Memtable>(config.memtable_capacity, create_policy->second(), logger),
      std::make_unique<WalWriterFactory>(directory, logger),
      table_writer,
      table_reader_factory,
      std::move(compactor),
      std::make_unique<RecoveryManager>(directory, table_reader_factory, logger),
  };
  return std::make_unique<LsmStore>(std::move(dependencies));
}

}  // namespace lsm
