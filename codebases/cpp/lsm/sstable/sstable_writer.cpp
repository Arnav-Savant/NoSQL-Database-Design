#include "lsm/sstable/sstable_writer.h"

#include <optional>
#include <utility>

#include "lsm/entry/entry_codec.h"
#include "lsm/io/file_names.h"
#include "lsm/sstable/table_format.h"

namespace lsm {

SSTableWriter::SSTableWriter(std::shared_ptr<const StorageDirectory> directory, StoreConfig config,
                             std::shared_ptr<const BloomHasher> hasher, std::shared_ptr<Logger> logger)
    : directory_(std::move(directory)), config_(std::move(config)), hasher_(std::move(hasher)), logger_(std::move(logger)) {}

std::string SSTableWriter::write(const TableRange& range, const std::vector<Entry>& entries) const {
  BloomFilter bloom = BloomFilter::for_entry_count(entries.size(), config_.bloom_bits_per_key, hasher_);
  const PackedBlocks packed = pack_blocks(entries, bloom);
  const Bytes index_bytes = SparseIndex(packed.blocks).to_bytes();
  const Bytes bloom_bytes = bloom.to_bytes();

  // NOTE: offsets are 32-bit, which limits one table to 4 GiB. Real engines use 64-bit offsets.
  Bytes footer;
  append_u32_be(footer, static_cast<std::uint32_t>(packed.data_bytes.size()));
  append_u32_be(footer, static_cast<std::uint32_t>(packed.data_bytes.size() + index_bytes.size()));
  append_u32_be(footer, static_cast<std::uint32_t>(entries.size()));
  append_u32_be(footer, kTableMagic);

  const std::string name = table_file_name(range);
  Bytes file_bytes = packed.data_bytes;
  append_bytes(file_bytes, index_bytes);
  append_bytes(file_bytes, bloom_bytes);
  append_bytes(file_bytes, footer);
  directory_->write_atomically(name, file_bytes);
  logger_->info("SSTable", "written",
                {{"table", name},
                 {"entries", std::to_string(entries.size())},
                 {"blocks", std::to_string(packed.blocks.size())},
                 {"bloomBits", std::to_string(bloom.set_bit_count()) + "/" + std::to_string(bloom.bit_count())},
                 {"bytes", std::to_string(file_bytes.size())}});
  return name;
}

SSTableWriter::PackedBlocks SSTableWriter::pack_blocks(const std::vector<Entry>& entries, BloomFilter& bloom) const {
  PackedBlocks packed;
  std::uint32_t offset = 0;
  std::optional<BlockHandle> current;

  for (const Entry& entry : entries) {
    const Bytes encoded = EntryCodec::encode(entry);
    const bool block_is_full = current && current->length + encoded.size() > config_.block_size_bytes;
    if (!current || block_is_full) {
      if (current) packed.blocks.push_back(*current);
      current = BlockHandle{entry.key(), offset, 0};
    }
    append_bytes(packed.data_bytes, encoded);
    current->length += static_cast<std::uint32_t>(encoded.size());
    offset += static_cast<std::uint32_t>(encoded.size());
    bloom.add(entry.key());
  }
  if (current) packed.blocks.push_back(*current);
  return packed;
}

}  // namespace lsm
