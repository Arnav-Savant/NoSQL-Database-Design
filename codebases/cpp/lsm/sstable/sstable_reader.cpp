#include "lsm/sstable/sstable_reader.h"

#include <stdexcept>
#include <utility>

#include "lsm/entry/entry_codec.h"
#include "lsm/entry/key_order.h"
#include "lsm/io/file_names.h"
#include "lsm/sstable/table_format.h"

namespace lsm {

SSTableReader::SSTableReader(std::shared_ptr<const StorageDirectory> directory, std::shared_ptr<Logger> logger,
                             std::string name, TableRange range, std::uint32_t entry_count, std::uint32_t index_offset,
                             SparseIndex sparse_index, BloomFilter bloom)
    : directory_(std::move(directory)),
      logger_(std::move(logger)),
      name_(std::move(name)),
      range_(range),
      entry_count_(entry_count),
      index_offset_(index_offset),
      sparse_index_(std::move(sparse_index)),
      bloom_(std::move(bloom)) {}

std::shared_ptr<SSTableReader> SSTableReader::open(std::shared_ptr<const StorageDirectory> directory,
                                                   const std::string& name, std::shared_ptr<const BloomHasher> hasher,
                                                   std::shared_ptr<Logger> logger) {
  const std::optional<TableRange> range = parse_table_file_name(name);
  if (!range) throw std::invalid_argument("\"" + name + "\" is not an SSTable file name.");
  const std::uintmax_t file_size = directory->size_of(name);
  if (file_size < kFooterBytes) throw std::runtime_error(name + " has no valid SSTable footer.");
  const Bytes footer = directory->read_range(name, file_size - kFooterBytes, kFooterBytes);
  if (read_u32_be(footer, 12) != kTableMagic) throw std::runtime_error(name + " has no valid SSTable footer.");

  const std::uint32_t index_offset = read_u32_be(footer, 0);
  const std::uint32_t bloom_offset = read_u32_be(footer, 4);
  const std::uint32_t entry_count = read_u32_be(footer, 8);
  if (index_offset > bloom_offset || bloom_offset > file_size - kFooterBytes) {
    throw std::runtime_error(name + " has inconsistent section offsets.");
  }
  SparseIndex sparse_index = SparseIndex::from_bytes(directory->read_range(name, index_offset, bloom_offset - index_offset));
  BloomFilter bloom = BloomFilter::from_bytes(
      directory->read_range(name, bloom_offset, static_cast<std::size_t>(file_size - kFooterBytes - bloom_offset)),
      std::move(hasher));
  return std::make_shared<SSTableReader>(std::move(directory), std::move(logger), name, *range, entry_count,
                                         index_offset, std::move(sparse_index), std::move(bloom));
}

bool SSTableReader::might_contain(const std::string& key) const { return bloom_.might_contain(key); }

std::optional<Entry> SSTableReader::find(const std::string& key) const {
  const std::optional<LocatedBlock> located = sparse_index_.locate(key);
  if (!located) {
    logger_->debug("SSTable", "key sorts before the first block, no read needed", {{"table", name_}, {"key", key}});
    return std::nullopt;
  }
  const BlockHandle& block = located->block;
  const std::vector<Entry> entries = EntryCodec::decode_all(directory_->read_range(name_, block.offset, block.length));
  logger_->debug("SSTable", "block read",
                 {{"table", name_},
                  {"block", std::to_string(located->index + 1)},
                  {"firstKey", block.first_key},
                  {"bytes", std::to_string(block.length)}});

  std::ptrdiff_t low = 0;
  std::ptrdiff_t high = static_cast<std::ptrdiff_t>(entries.size()) - 1;
  while (low <= high) {
    const std::ptrdiff_t middle = (low + high) / 2;
    const Entry& candidate = entries[static_cast<std::size_t>(middle)];
    const int order = compare_keys(candidate.key(), key);
    if (order == 0) return candidate;
    if (order < 0) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return std::nullopt;
}

std::vector<Entry> SSTableReader::read_all_entries() const {
  return EntryCodec::decode_all(directory_->read_range(name_, 0, index_offset_));
}

TableDescription SSTableReader::describe() const {
  return TableDescription{name_,
                          range_.min(),
                          range_.max(),
                          entry_count_,
                          sparse_index_.blocks(),
                          BloomDescription{bloom_.bit_count(), bloom_.hash_count(), bloom_.set_bit_count()}};
}

}  // namespace lsm
