#pragma once

#include <cstddef>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "lsm/entry/entry.h"
#include "lsm/logging/logger.h"
#include "lsm/memtable/eviction/eviction_policy.h"

namespace lsm {

/// Written since the last flush (only in the WAL), or already saved in an SSTable.
enum class EntryState { kDirty, kClean };

inline const char* entry_state_name(EntryState state) { return state == EntryState::kDirty ? "dirty" : "clean"; }

struct MemtableSlot {
  Entry entry;
  EntryState state;
};

struct MemtableRow {
  std::string key;
  std::string value;
  std::string state;
};

/// In-memory table holding the newest value of recently written keys (dirty) and a cache of recently read keys (clean).
class Memtable {
 public:
  Memtable(std::size_t capacity, std::unique_ptr<EvictionPolicy> eviction_policy, std::shared_ptr<Logger> logger);

  std::size_t capacity() const { return capacity_; }
  std::size_t size() const { return slots_.size(); }
  std::size_t dirty_count() const;

  std::optional<MemtableSlot> get(const std::string& key);
  void put_dirty(const Entry& entry);
  void put_clean(const Entry& entry);
  bool is_saturated_with_dirty() const;
  std::vector<Entry> dirty_entries_sorted_by_key() const;
  void mark_all_clean();
  std::vector<MemtableRow> rows() const;

 private:
  bool evict_one_clean_entry();
  std::string occupancy() const;

  // Ordered by key bytes, which rows() and dirty_entries_sorted_by_key() rely on.
  std::map<std::string, MemtableSlot> slots_;
  std::size_t capacity_;
  std::unique_ptr<EvictionPolicy> eviction_policy_;
  std::shared_ptr<Logger> logger_;
};

}  // namespace lsm
