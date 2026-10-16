#include "lsm/wal/wal_writer.h"

#include <utility>

#include "lsm/entry/entry_codec.h"
#include "lsm/io/crc32.h"
#include "lsm/io/file_names.h"

namespace lsm {

WalWriter::WalWriter(std::shared_ptr<const StorageDirectory> directory, std::uint64_t sequence,
                     std::shared_ptr<Logger> logger)
    : directory_(std::move(directory)),
      logger_(std::move(logger)),
      sequence_(sequence),
      name_(wal_file_name(sequence)),
      descriptor_(directory_->open_for_append(name_)),
      size_bytes_(directory_->size_of(name_)) {}

// A writer abandoned without close() (a simulated crash) still releases its descriptor.
WalWriter::~WalWriter() {
  if (descriptor_ >= 0) directory_->close_file(descriptor_);
}

void WalWriter::append(const Entry& entry) {
  const Bytes payload = EntryCodec::encode(entry);
  Bytes record;
  record.reserve(kWalRecordHeaderBytes + payload.size());
  append_u32_be(record, crc32(payload));
  append_u32_be(record, static_cast<std::uint32_t>(payload.size()));
  append_bytes(record, payload);

  // NOTE: one fsync per write is the safest choice and the slowest. Production systems batch
  // several writes into one fsync (group commit) to trade a little latency for throughput.
  directory_->append_and_sync(descriptor_, record);
  size_bytes_ += record.size();
  record_count_ += 1;
  logger_->debug("Wal", "appended",
                 {{"wal", name_},
                  {"key", entry.key()},
                  {"bytes", std::to_string(record.size())},
                  {"walBytes", std::to_string(size_bytes_)}});
}

void WalWriter::close() {
  if (descriptor_ < 0) return;
  directory_->close_file(descriptor_);
  descriptor_ = -1;
}

}  // namespace lsm
