#include "lsm/wal/wal_reader.h"

#include "lsm/entry/entry_codec.h"
#include "lsm/io/crc32.h"
#include "lsm/wal/wal_writer.h"

namespace lsm {

WalReplay WalReader::replay(const StorageDirectory& directory, const std::string& name) {
  const Bytes bytes = directory.read_all(name);
  std::vector<Entry> entries;
  std::size_t offset = 0;

  while (offset < bytes.size()) {
    const std::size_t remaining = bytes.size() - offset;
    if (remaining < kWalRecordHeaderBytes) break;

    const std::uint32_t expected_checksum = read_u32_be(bytes, offset);
    const std::uint32_t payload_length = read_u32_be(bytes, offset + 4);
    if (remaining < kWalRecordHeaderBytes + payload_length) break;

    const std::size_t payload_start = offset + kWalRecordHeaderBytes;
    const Bytes payload = slice(bytes, payload_start, payload_start + payload_length);
    if (crc32(payload) != expected_checksum) break;

    entries.push_back(EntryCodec::decode(payload, 0).entry);
    offset = payload_start + payload_length;
  }

  // Anything after the last valid record was being written when the process died. That write
  // was never acknowledged, so dropping it loses nothing a client was promised.
  return WalReplay{std::move(entries), offset, bytes.size() - offset};
}

}  // namespace lsm
