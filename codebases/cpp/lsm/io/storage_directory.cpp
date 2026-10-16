#include "lsm/io/storage_directory.h"

#include <fcntl.h>
#include <sys/types.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <stdexcept>
#include <string>
#include <system_error>
#include <utility>

#include "lsm/io/file_names.h"

namespace lsm {
namespace {

[[noreturn]] void throw_errno(const std::string& action, const std::filesystem::path& path) {
  throw std::system_error(errno, std::generic_category(), action + " " + path.string());
}

void write_all_bytes(int descriptor, const Bytes& bytes, const std::filesystem::path& path) {
  std::size_t written = 0;
  while (written < bytes.size()) {
    const ssize_t count = ::write(descriptor, bytes.data() + written, bytes.size() - written);
    if (count < 0) {
      if (errno == EINTR) continue;
      throw_errno("cannot write", path);
    }
    written += static_cast<std::size_t>(count);
  }
}

void sync_descriptor(int descriptor, const std::filesystem::path& path) {
  if (::fsync(descriptor) != 0) throw_errno("cannot fsync", path);
}

// Owns one POSIX descriptor and closes it on every exit path, including exceptions.
class FileHandle {
 public:
  FileHandle(const std::filesystem::path& path, int flags, mode_t mode = 0644)
      : path_(path), descriptor_(::open(path.c_str(), flags | O_CLOEXEC, mode)) {
    if (descriptor_ < 0) throw_errno("cannot open", path_);
  }

  explicit FileHandle(int descriptor) : descriptor_(descriptor) {}

  FileHandle(const FileHandle&) = delete;
  FileHandle& operator=(const FileHandle&) = delete;

  ~FileHandle() {
    if (descriptor_ >= 0) ::close(descriptor_);
  }

  int release() { return std::exchange(descriptor_, -1); }

  void write_all(const Bytes& bytes) const { write_all_bytes(descriptor_, bytes, path_); }

  void sync() const { sync_descriptor(descriptor_, path_); }

  std::size_t read_at(std::uint8_t* buffer, std::size_t length, std::uint64_t offset) const {
    std::size_t total = 0;
    while (total < length) {
      const ssize_t count = ::pread(descriptor_, buffer + total, length - total, static_cast<off_t>(offset + total));
      if (count < 0) {
        if (errno == EINTR) continue;
        throw_errno("cannot read", path_);
      }
      if (count == 0) break;
      total += static_cast<std::size_t>(count);
    }
    return total;
  }

  void truncate(std::uint64_t length) const {
    if (::ftruncate(descriptor_, static_cast<off_t>(length)) != 0) throw_errno("cannot truncate", path_);
  }

 private:
  std::filesystem::path path_;
  int descriptor_;
};

}  // namespace

StorageDirectory::StorageDirectory(const std::filesystem::path& root)
    : root_(std::filesystem::absolute(root).lexically_normal()) {}

void StorageDirectory::ensure_exists() const { std::filesystem::create_directories(root_); }

std::vector<std::string> StorageDirectory::list() const {
  std::vector<std::string> names;
  for (const auto& item : std::filesystem::directory_iterator(root_)) names.push_back(item.path().filename().string());
  std::sort(names.begin(), names.end());
  return names;
}

std::filesystem::path StorageDirectory::path_of(const std::string& name) const { return root_ / name; }

std::uintmax_t StorageDirectory::size_of(const std::string& name) const {
  return std::filesystem::file_size(path_of(name));
}

Bytes StorageDirectory::read_all(const std::string& name) const {
  const FileHandle file(path_of(name), O_RDONLY);
  Bytes bytes(static_cast<std::size_t>(size_of(name)));
  bytes.resize(file.read_at(bytes.data(), bytes.size(), 0));
  return bytes;
}

Bytes StorageDirectory::read_range(const std::string& name, std::uint64_t offset, std::size_t length) const {
  const FileHandle file(path_of(name), O_RDONLY);
  Bytes buffer(length);
  const std::size_t bytes_read = file.read_at(buffer.data(), length, offset);
  if (bytes_read != length) {
    throw std::runtime_error("Short read in " + name + ": wanted " + std::to_string(length) + " bytes at " +
                             std::to_string(offset) + ", got " + std::to_string(bytes_read) + ".");
  }
  return buffer;
}

// A crash can never leave a half-written file under its final name: the bytes go to a
// temporary file, reach the disk, and only then does an atomic rename publish them.
void StorageDirectory::write_atomically(const std::string& name, const Bytes& bytes) const {
  const std::string temporary_name = name + kTempSuffix;
  {
    const FileHandle file(path_of(temporary_name), O_WRONLY | O_CREAT | O_TRUNC);
    file.write_all(bytes);
    file.sync();
  }
  std::filesystem::rename(path_of(temporary_name), path_of(name));
  sync_directory();
}

int StorageDirectory::open_for_append(const std::string& name) const {
  FileHandle file(path_of(name), O_WRONLY | O_CREAT | O_APPEND);
  sync_directory();
  return file.release();
}

// The caller owns the descriptor, so it is used directly rather than wrapped in a FileHandle.
void StorageDirectory::append_and_sync(int descriptor, const Bytes& bytes) const {
  write_all_bytes(descriptor, bytes, root_);
  sync_descriptor(descriptor, root_);
}

void StorageDirectory::close_file(int descriptor) const { const FileHandle file(descriptor); }

void StorageDirectory::truncate(const std::string& name, std::uint64_t length) const {
  const FileHandle file(path_of(name), O_WRONLY);
  file.truncate(length);
  file.sync();
}

void StorageDirectory::remove(const std::string& name) const {
  std::error_code ignored;
  std::filesystem::remove(path_of(name), ignored);
  sync_directory();
}

// NOTE: syncing the directory makes the creation, rename or deletion of a file itself durable.
// This works on Linux; some platforms don't allow opening a directory and skip this step.
void StorageDirectory::sync_directory() const {
  const int descriptor = ::open(root_.c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC);
  if (descriptor < 0) return;  // Best effort on platforms without directory fsync.
  const FileHandle directory(descriptor);
  ::fsync(descriptor);
}

}  // namespace lsm
