#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "lsm/entry/value.h"
#include "lsm/memtable/memtable.h"
#include "lsm/sstable/sstable_reader.h"

namespace lsm {

struct ActiveWalView {
  std::string name;
  std::uintmax_t size_bytes;
  std::size_t records;
};

struct MemtableView {
  std::size_t capacity;
  std::vector<MemtableRow> rows;
};

struct StoreSnapshot {
  ActiveWalView active_wal;
  MemtableView memtable;
  std::vector<TableDescription> tables;
};

/// Point lookups by key.
class KeyValueReader {
 public:
  virtual ~KeyValueReader() = default;
  // Returns the current Value, or nullopt when the key is absent or deleted.
  virtual std::optional<Value> get(const std::string& key) = 0;
};

/// Inserts, updates and deletes.
class KeyValueWriter {
 public:
  virtual ~KeyValueWriter() = default;
  virtual void put(const std::string& key, const Value& value) = 0;
  // Named remove because delete is a C++ keyword.
  virtual void remove(const std::string& key) = 0;
};

/// Opening (with recovery) and closing.
class Lifecycle {
 public:
  virtual ~Lifecycle() = default;
  virtual void open() = 0;
  virtual void close() = 0;
};

/// Read-only view of internal state, for teaching and debugging.
class StoreInspector {
 public:
  virtual ~StoreInspector() = default;
  virtual StoreSnapshot snapshot() const = 0;
};

}  // namespace lsm
