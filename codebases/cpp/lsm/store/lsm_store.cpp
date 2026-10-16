#include "lsm/store/lsm_store.h"

#include <algorithm>
#include <stdexcept>
#include <utility>

#include "lsm/sstable/table_range.h"

namespace lsm {

LsmStore::LsmStore(Dependencies dependencies)
    : config_(std::move(dependencies.config)),
      directory_(std::move(dependencies.directory)),
      logger_(std::move(dependencies.logger)),
      memtable_(std::move(dependencies.memtable)),
      wal_factory_(std::move(dependencies.wal_factory)),
      table_writer_(std::move(dependencies.table_writer)),
      table_reader_factory_(std::move(dependencies.table_reader_factory)),
      compactor_(std::move(dependencies.compactor)),
      recovery_manager_(std::move(dependencies.recovery_manager)) {}

void LsmStore::open() {
  directory_->ensure_exists();
  RecoveredState recovered = recovery_manager_->recover();
  tables_ = std::move(recovered.tables);
  const std::vector<RecoveredWal>& wals = recovered.wals;

  for (const RecoveredWal& wal : wals) {
    for (const Entry& entry : wal.entries) memtable_->put_dirty(entry);
  }

  std::uint64_t highest_table_sequence = 0;
  for (const TablePtr& table : tables_) highest_table_sequence = std::max(highest_table_sequence, table->range().max());
  const std::uint64_t active_sequence = !wals.empty() ? wals.back().sequence : highest_table_sequence + 1;
  wal_ = wal_factory_->open(active_sequence);
  unflushed_wal_names_.clear();
  if (!wals.empty()) {
    for (const RecoveredWal& wal : wals) unflushed_wal_names_.push_back(wal.name);
  } else {
    unflushed_wal_names_.push_back(wal_->name());
  }
  oldest_unflushed_sequence_ = !wals.empty() ? wals.front().sequence : active_sequence;

  logger_->info("Store", "opened",
                {{"tables", std::to_string(tables_.size())},
                 {"activeWal", wal_->name()},
                 {"recoveredEntries", std::to_string(memtable_->size())}});
  // Several unflushed WALs mean a crash interrupted a flush; fold them into one table now.
  if (wals.size() > 1 || flush_is_due()) flush("recovery");
}

void LsmStore::close() {
  if (wal_) wal_->close();
  wal_.reset();
  logger_->info("Store", "closed");
}

void LsmStore::put(const std::string& key, const Value& value) { write(Entry(key, value)); }

void LsmStore::remove(const std::string& key) { write(Entry::tombstone(key)); }

std::optional<Value> LsmStore::get(const std::string& key) {
  const std::optional<MemtableSlot> cached = memtable_->get(key);
  if (cached) {
    logger_->debug("Read", "memtable hit",
                   {{"key", key}, {"state", entry_state_name(cached->state)}, {"value", cached->entry.value().display()}});
    if (cached->entry.is_tombstone()) return std::nullopt;
    return cached->entry.value();
  }
  logger_->debug("Read", "memtable miss, checking tables newest first",
                 {{"key", key}, {"tables", std::to_string(tables_.size())}});

  for (const TablePtr& table : tables_newest_first()) {
    if (!table->might_contain(key)) {
      logger_->debug("Read", "bloom filter says definitely absent, table skipped", {{"key", key}, {"table", table->name()}});
      continue;
    }
    const std::optional<Entry> entry = table->find(key);
    if (!entry) {
      logger_->debug("Read", "bloom filter false positive, key not in block", {{"key", key}, {"table", table->name()}});
      continue;
    }
    logger_->debug("Read", "found on disk", {{"key", key}, {"table", table->name()}, {"value", entry->value().display()}});
    memtable_->put_clean(*entry);
    if (entry->is_tombstone()) return std::nullopt;
    return entry->value();
  }
  logger_->debug("Read", "not found in any table", {{"key", key}});
  return std::nullopt;
}

StoreSnapshot LsmStore::snapshot() const {
  if (!wal_) throw std::logic_error("The store is not open.");
  std::vector<TableDescription> tables;
  for (const TablePtr& table : tables_newest_first()) tables.push_back(table->describe());
  return StoreSnapshot{ActiveWalView{wal_->name(), wal_->size_bytes(), wal_->record_count()},
                       MemtableView{memtable_->capacity(), memtable_->rows()}, std::move(tables)};
}

void LsmStore::write(const Entry& entry) {
  // Durable first: once the WAL append returns, a crash can no longer lose this write.
  wal_->append(entry);
  memtable_->put_dirty(entry);
  if (flush_is_due()) {
    flush(memtable_->is_saturated_with_dirty() ? "memtable full of dirty entries" : "WAL reached its size limit");
  }
}

bool LsmStore::flush_is_due() const {
  return wal_->size_bytes() >= config_.wal_max_bytes || memtable_->is_saturated_with_dirty();
}

void LsmStore::flush(const std::string& reason) {
  const std::vector<Entry> entries = memtable_->dirty_entries_sorted_by_key();
  if (entries.empty()) return;
  logger_->info("Flush", "started", {{"reason", reason}, {"dirtyEntries", std::to_string(entries.size())}});

  const TableRange range(oldest_unflushed_sequence_, wal_->sequence());
  const std::string table_name = table_writer_->write(range, entries);
  tables_.push_back(table_reader_factory_->open(table_name));
  memtable_->mark_all_clean();

  // Only now that the table is durable can the WALs it replaces be deleted.
  const std::uint64_t next_sequence = wal_->sequence() + 1;
  wal_->close();
  for (const std::string& wal_name : unflushed_wal_names_) {
    directory_->remove(wal_name);
    logger_->info("Wal", "deleted, its entries are in the new table", {{"wal", wal_name}});
  }
  wal_ = wal_factory_->open(next_sequence);
  unflushed_wal_names_ = {wal_->name()};
  oldest_unflushed_sequence_ = next_sequence;
  logger_->info("Flush", "finished", {{"table", table_name}, {"cleanEntries", std::to_string(memtable_->size())}});

  tables_ = compactor_->compact_until_stable(tables_);
}

std::vector<TablePtr> LsmStore::tables_newest_first() const {
  std::vector<TablePtr> tables = tables_;
  std::stable_sort(tables.begin(), tables.end(),
                   [](const TablePtr& left, const TablePtr& right) { return left->range().max() > right->range().max(); });
  return tables;
}

}  // namespace lsm
