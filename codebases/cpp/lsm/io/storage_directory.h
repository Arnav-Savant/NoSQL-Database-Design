#pragma once

#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

#include "lsm/io/big_endian.h"

namespace lsm {

/// All file-system access of the store, by file name inside one data directory.
class StorageDirectory {
 public:
  explicit StorageDirectory(const std::filesystem::path& root);

  const std::filesystem::path& root() const { return root_; }

  void ensure_exists() const;
  std::vector<std::string> list() const;
  std::filesystem::path path_of(const std::string& name) const;
  std::uintmax_t size_of(const std::string& name) const;
  Bytes read_all(const std::string& name) const;
  Bytes read_range(const std::string& name, std::uint64_t offset, std::size_t length) const;
  void write_atomically(const std::string& name, const Bytes& bytes) const;

  // Returns a POSIX descriptor that stays open across appends; close it with close_file.
  int open_for_append(const std::string& name) const;
  void append_and_sync(int descriptor, const Bytes& bytes) const;
  void close_file(int descriptor) const;

  void truncate(const std::string& name, std::uint64_t length) const;
  void remove(const std::string& name) const;

 private:
  void sync_directory() const;

  std::filesystem::path root_;
};

}  // namespace lsm
