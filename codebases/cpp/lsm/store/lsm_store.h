#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "lsm/compaction/compactor.h"
#include "lsm/config/store_config.h"
#include "lsm/entry/entry.h"
#include "lsm/io/storage_directory.h"
#include "lsm/logging/logger.h"
#include "lsm/memtable/memtable.h"
#include "lsm/recovery/recovery_manager.h"
#include "lsm/sstable/sstable_reader_factory.h"
#include "lsm/sstable/sstable_writer.h"
#include "lsm/store/contracts.h"
#include "lsm/wal/wal_writer.h"
#include "lsm/wal/wal_writer_factory.h"

namespace lsm {

/// A log-structured merge tree key-value store.
class LsmStore : public KeyValueReader, public KeyValueWriter, public Lifecycle, public StoreInspector {
 public:
  struct Dependencies {
    StoreConfig config;
    std::shared_ptr<const StorageDirectory> directory;
    std::shared_ptr<Logger> logger;
    std::unique_ptr<Memtable> memtable;
    std::unique_ptr<WalWriterFactory> wal_factory;
    std::shared_ptr<const SSTableWriter> table_writer;
    std::shared_ptr<const SSTableReaderFactory> table_reader_factory;
    std::unique_ptr<Compactor> compactor;
    std::unique_ptr<RecoveryManager> recovery_manager;
  };

  explicit LsmStore(Dependencies dependencies);

  void open() override;
  void close() override;
  void put(const std::string& key, const Value& value) override;
  void remove(const std::string& key) override;
  std::optional<Value> get(const std::string& key) override;
  StoreSnapshot snapshot() const override;

 private:
  void write(const Entry& entry);
  bool flush_is_due() const;
  void flush(const std::string& reason);
  std::vector<TablePtr> tables_newest_first() const;

  StoreConfig config_;
  std::shared_ptr<const StorageDirectory> directory_;
  std::shared_ptr<Logger> logger_;
  std::unique_ptr<Memtable> memtable_;
  std::unique_ptr<WalWriterFactory> wal_factory_;
  std::shared_ptr<const SSTableWriter> table_writer_;
  std::shared_ptr<const SSTableReaderFactory> table_reader_factory_;
  std::unique_ptr<Compactor> compactor_;
  std::unique_ptr<RecoveryManager> recovery_manager_;

  std::unique_ptr<WalWriter> wal_;
  std::vector<TablePtr> tables_;
  std::vector<std::string> unflushed_wal_names_;
  std::uint64_t oldest_unflushed_sequence_ = 0;
};

}  // namespace lsm
