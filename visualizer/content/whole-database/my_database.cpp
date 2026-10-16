// MyDatabase: the complete LSM-tree key-value store in one class.
//
// This file shows how the pieces fit together. The building blocks it uses (WriteAheadLog,
// Memtable, SSTable, BloomFilter, SparseIndex, EntryMerger) are assumed to exist; their full,
// runnable implementations live in codebases/cpp/lsm/.

#include <algorithm>
#include <filesystem>
#include <iostream>
#include <optional>
#include <string>
#include <vector>

class MyDatabase {
 public:
  explicit MyDatabase(std::filesystem::path directory)
      : directory_(std::move(directory)), memtable_(kMemtableCapacity, std::make_unique<LruEvictionPolicy>()) {
    recover();
  }

  ~MyDatabase() { wal_.close(); }

  // ------------------------------------------------------------- writes

  void put(const std::string& key, Value value) { write(Entry::of(key, std::move(value))); }

  void remove(const std::string& key) {
    write(Entry::tombstone(key));  // SSTables are immutable, so a delete is a marker
  }

  // -------------------------------------------------------------- reads

  std::optional<Value> get(const std::string& key) {
    if (auto cached = memtable_.get(key)) {  // dirty or clean, it is the newest value
      return cached->is_tombstone() ? std::nullopt : std::optional<Value>(cached->value());
    }
    for (SSTable& table : newest_first()) {  // first match wins, so the newest value wins
      if (!table.bloom_filter().might_contain(key)) continue;  // definitely absent: no disk read
      auto found = table.read_block(table.sparse_index().locate(key)).find(key);
      if (!found) continue;           // a Bloom filter false positive cost one block read
      memtable_.put_clean(*found);    // cache it; clean entries may be evicted
      return found->is_tombstone() ? std::nullopt : std::optional<Value>(found->value());
    }
    return std::nullopt;
  }

 private:
  static constexpr std::uint64_t kWalMaxBytes = 4 * 1024 * 1024;
  static constexpr std::size_t kMemtableCapacity = 100'000;
  static constexpr std::size_t kCompactionTrigger = 4;

  void write(const Entry& entry) {
    wal_.append_and_sync(entry);  // durable first: a crash after this loses nothing
    memtable_.put_dirty(entry);   // newest value, never evicted until flushed
    if (wal_.size_bytes() >= kWalMaxBytes || memtable_.is_full_of_dirty_entries()) flush();
  }

  // -------------------------------------------------------------- flush

  void flush() {
    std::vector<Entry> dirty = memtable_.dirty_entries_sorted_by_key();
    if (dirty.empty()) return;
    // Blocks + sparse index + Bloom filter + footer, written to a temp file, fsynced, renamed.
    tables_.push_back(SSTable::write_atomically(directory_, wal_.sequence(), wal_.sequence(), dirty));
    memtable_.mark_all_clean();  // entries stay in RAM as a cache
    WriteAheadLog flushed = std::move(wal_);
    wal_ = WriteAheadLog::create(directory_, flushed.sequence() + 1);
    flushed.close_and_delete();  // its data is now safely in the SSTable
    compact();
  }

  // --------------------------------------------------------- compaction

  void compact() {
    while (tables_.size() >= kCompactionTrigger) {
      std::sort(tables_.begin(), tables_.end(),
                [](const SSTable& a, const SSTable& b) { return a.max_sequence() < b.max_sequence(); });
      SSTable older = std::move(tables_[0]);
      SSTable newer = std::move(tables_[1]);
      tables_.erase(tables_.begin(), tables_.begin() + 2);
      const bool drop_tombstones = true;  // the oldest table is in this merge: nothing older can resurrect a key
      std::vector<Entry> merged = EntryMerger::merge(older.read_all(), newer.read_all(), drop_tombstones);  // newer wins
      tables_.push_back(SSTable::write_atomically(directory_, older.min_sequence(), newer.max_sequence(), merged));
      older.remove_file();
      newer.remove_file();
    }
  }

  // ----------------------------------------------------------- recovery

  void recover() {
    Storage::delete_temporary_files(directory_);               // unfinished flushes or merges
    tables_ = SSTable::open_all(directory_);                   // loads each sparse index and Bloom filter
    Storage::delete_tables_contained_in_others(directory_, tables_);  // inputs of a finished merge
    std::uint64_t flushed_up_to = 0;
    for (const SSTable& table : tables_) flushed_up_to = std::max(flushed_up_to, table.max_sequence());
    WriteAheadLog::delete_covered_by(directory_, flushed_up_to);  // already flushed before the crash

    if (auto unflushed = WriteAheadLog::open_latest(directory_)) {
      for (const Entry& entry : unflushed->replay_until_checksum_fails()) memtable_.put_dirty(entry);  // torn tail truncated
      wal_ = std::move(*unflushed);
    } else {
      wal_ = WriteAheadLog::create(directory_, flushed_up_to + 1);
    }
  }

  std::vector<std::reference_wrapper<SSTable>> newest_first() {
    std::vector<std::reference_wrapper<SSTable>> ordered(tables_.begin(), tables_.end());
    std::sort(ordered.begin(), ordered.end(),
              [](const SSTable& a, const SSTable& b) { return a.max_sequence() > b.max_sequence(); });
    return ordered;
  }

  std::filesystem::path directory_;
  Memtable memtable_;
  std::vector<SSTable> tables_;  // each has a BloomFilter and a SparseIndex
  WriteAheadLog wal_;
};

// ------------------------------------------------------------------- main

int main() {
  MyDatabase db("data");
  db.put("iphone11", Value::of(4.8));
  db.put("macbook", Value::of(4.9));
  db.put("macbook", Value::of("Apple"));  // values can change type: no schema
  db.put("airpods", Value::of(true));

  std::cout << db.get("macbook")->display() << '\n';  // "Apple", served from the memtable
  db.remove("airpods");
  std::cout << (db.get("airpods") ? "found" : "not found") << '\n';  // hidden by a tombstone
  return 0;
}
