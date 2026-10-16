#include "lsm/memtable/memtable.h"

#include <utility>

namespace lsm {

Memtable::Memtable(std::size_t capacity, std::unique_ptr<EvictionPolicy> eviction_policy,
                   std::shared_ptr<Logger> logger)
    : capacity_(capacity), eviction_policy_(std::move(eviction_policy)), logger_(std::move(logger)) {}

std::size_t Memtable::dirty_count() const {
  std::size_t count = 0;
  for (const auto& [key, slot] : slots_) {
    if (slot.state == EntryState::kDirty) ++count;
  }
  return count;
}

std::optional<MemtableSlot> Memtable::get(const std::string& key) {
  const auto found = slots_.find(key);
  if (found == slots_.end()) return std::nullopt;
  eviction_policy_->record_access(key);
  return found->second;
}

void Memtable::put_dirty(const Entry& entry) {
  const bool is_new_key = slots_.count(entry.key()) == 0;
  if (is_new_key && slots_.size() >= capacity_) evict_one_clean_entry();
  // A dirty entry is stored even past capacity; the store then flushes, which frees room.
  slots_.insert_or_assign(entry.key(), MemtableSlot{entry, EntryState::kDirty});
  if (is_new_key) {
    eviction_policy_->record_insert(entry.key());
  } else {
    eviction_policy_->record_access(entry.key());
  }
  logger_->debug("Memtable", "stored",
                 {{"key", entry.key()},
                  {"value", entry.value().display()},
                  {"state", entry_state_name(EntryState::kDirty)},
                  {"slots", occupancy()}});
}

void Memtable::put_clean(const Entry& entry) {
  // Anything already here is at least as new as what was read from disk.
  if (slots_.count(entry.key()) != 0) return;
  if (slots_.size() >= capacity_ && !evict_one_clean_entry()) {
    logger_->debug("Memtable", "not cached, every slot is dirty", {{"key", entry.key()}, {"slots", occupancy()}});
    return;
  }
  slots_.insert_or_assign(entry.key(), MemtableSlot{entry, EntryState::kClean});
  eviction_policy_->record_insert(entry.key());
  logger_->debug("Memtable", "stored",
                 {{"key", entry.key()},
                  {"value", entry.value().display()},
                  {"state", entry_state_name(EntryState::kClean)},
                  {"slots", occupancy()}});
}

bool Memtable::is_saturated_with_dirty() const { return dirty_count() >= capacity_; }

std::vector<Entry> Memtable::dirty_entries_sorted_by_key() const {
  std::vector<Entry> entries;
  for (const auto& [key, slot] : slots_) {
    if (slot.state == EntryState::kDirty) entries.push_back(slot.entry);
  }
  return entries;
}

// After a flush the entries stay in memory as a cache; only their state changes.
void Memtable::mark_all_clean() {
  for (auto& [key, slot] : slots_) slot.state = EntryState::kClean;
}

std::vector<MemtableRow> Memtable::rows() const {
  std::vector<MemtableRow> rows;
  for (const auto& [key, slot] : slots_) rows.push_back({key, slot.entry.value().display(), entry_state_name(slot.state)});
  return rows;
}

// NOTE: only clean entries may be evicted. A dirty entry's newest value exists nowhere else
// except the WAL, so dropping it would make reads return an older value from disk.
bool Memtable::evict_one_clean_entry() {
  const std::optional<std::string> victim = eviction_policy_->select_victim([this](const std::string& key) {
    const auto found = slots_.find(key);
    return found != slots_.end() && found->second.state == EntryState::kClean;
  });
  if (!victim) return false;
  slots_.erase(*victim);
  eviction_policy_->record_removal(*victim);
  logger_->debug("Eviction", "evicted clean entry",
                 {{"key", *victim}, {"policy", eviction_policy_->name()}, {"dirtyKept", std::to_string(dirty_count())}});
  return true;
}

std::string Memtable::occupancy() const { return std::to_string(slots_.size()) + "/" + std::to_string(capacity_); }

}  // namespace lsm
