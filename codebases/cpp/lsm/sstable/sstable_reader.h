#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "lsm/entry/entry.h"
#include "lsm/io/storage_directory.h"
#include "lsm/logging/logger.h"
#include "lsm/sstable/bloom_filter.h"
#include "lsm/sstable/bloom_hasher.h"
#include "lsm/sstable/sparse_index.h"
#include "lsm/sstable/table_range.h"

namespace lsm {

struct BloomDescription {
  std::uint32_t bit_count;
  std::uint32_t hash_count;
  std::uint32_t set_bits;
};

struct TableDescription {
  std::string name;
  std::uint64_t min_sequence;
  std::uint64_t max_sequence;
  std::uint32_t entry_count;
  std::vector<BlockHandle> blocks;
  BloomDescription bloom;
};

/// Reads one SSTable: the index and Bloom filter stay in memory, data blocks are read on demand.
class SSTableReader {
 public:
  SSTableReader(std::shared_ptr<const StorageDirectory> directory, std::shared_ptr<Logger> logger, std::string name,
                TableRange range, std::uint32_t entry_count, std::uint32_t index_offset, SparseIndex sparse_index,
                BloomFilter bloom);

  static std::shared_ptr<SSTableReader> open(std::shared_ptr<const StorageDirectory> directory, const std::string& name,
                                             std::shared_ptr<const BloomHasher> hasher, std::shared_ptr<Logger> logger);

  const std::string& name() const { return name_; }
  const TableRange& range() const { return range_; }
  std::uint32_t entry_count() const { return entry_count_; }
  const SparseIndex& sparse_index() const { return sparse_index_; }
  const BloomFilter& bloom() const { return bloom_; }

  bool might_contain(const std::string& key) const;
  // Reads at most one block from disk; returns the entry (possibly a tombstone) or nullopt.
  std::optional<Entry> find(const std::string& key) const;
  std::vector<Entry> read_all_entries() const;
  TableDescription describe() const;

 private:
  std::shared_ptr<const StorageDirectory> directory_;
  std::shared_ptr<Logger> logger_;
  std::string name_;
  TableRange range_;
  std::uint32_t entry_count_;
  std::uint32_t index_offset_;
  SparseIndex sparse_index_;
  BloomFilter bloom_;
};

// Tables are shared between the store and the compactor, and compared by identity.
using TablePtr = std::shared_ptr<SSTableReader>;

}  // namespace lsm
