#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>

#include "lsm/entry/entry.h"
#include "lsm/io/storage_directory.h"
#include "lsm/logging/logger.h"

namespace lsm {

inline constexpr std::size_t kWalRecordHeaderBytes = 8;

// Record layout (big-endian): u32 crc32(payload) | u32 payloadLength | payload (an encoded Entry)
/// Appends entries to one write-ahead log file.
class WalWriter {
 public:
  WalWriter(std::shared_ptr<const StorageDirectory> directory, std::uint64_t sequence, std::shared_ptr<Logger> logger);
  ~WalWriter();

  WalWriter(const WalWriter&) = delete;
  WalWriter& operator=(const WalWriter&) = delete;

  std::uint64_t sequence() const { return sequence_; }
  const std::string& name() const { return name_; }
  std::uintmax_t size_bytes() const { return size_bytes_; }
  std::size_t record_count() const { return record_count_; }

  void append(const Entry& entry);
  void close();

 private:
  std::shared_ptr<const StorageDirectory> directory_;
  std::shared_ptr<Logger> logger_;
  std::uint64_t sequence_;
  std::string name_;
  int descriptor_;
  std::uintmax_t size_bytes_;
  std::size_t record_count_ = 0;
};

}  // namespace lsm
