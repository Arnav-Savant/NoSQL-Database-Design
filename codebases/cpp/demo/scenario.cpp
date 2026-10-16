#include "demo/scenario.h"

#include <fstream>
#include <iterator>
#include <stdexcept>
#include <utility>

#include "lsm/io/big_endian.h"

namespace demo {
namespace {

lsm::Bytes read_file(const std::filesystem::path& path) {
  std::ifstream file(path, std::ios::binary);
  if (!file) throw std::runtime_error("cannot read " + path.string());
  return lsm::Bytes(std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>());
}

void append_to_file(const std::filesystem::path& path, const lsm::Bytes& bytes) {
  std::ofstream file(path, std::ios::binary | std::ios::app);
  file.write(reinterpret_cast<const char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
  if (!file) throw std::runtime_error("cannot append to " + path.string());
}

}  // namespace

Scenario::Scenario(StoreOpener open_store, std::shared_ptr<const Narrator> narrator,
                   std::shared_ptr<const StatePrinter> printer, std::filesystem::path data_directory)
    : open_store_(std::move(open_store)),
      narrator_(std::move(narrator)),
      printer_(std::move(printer)),
      data_directory_(std::move(data_directory)) {}

void Scenario::run() {
  opening_an_empty_store();
  first_writes();
  values_without_a_schema();
  inside_the_first_sstable();
  reads_served_from_memory();
  filling_the_cache();
  reads_that_reach_the_disk();
  deleting_a_key();
  compaction();
  crash_and_recovery();
  summary();
}

void Scenario::opening_an_empty_store() {
  narrator_->chapter(
      "1", "Opening an empty store",
      {"The store keeps everything in one data directory. Opening it first runs recovery, which finds nothing to "
       "recover in an empty directory, and then creates the first write-ahead log (WAL): an append-only file that "
       "every write reaches before anything else happens.",
       "Writing to the WAL first is what makes the store durable. Once a write is in the WAL and forced to disk, a "
       "crash can no longer lose it."});
  store_ = open_store_();
  printer_->print_snapshot(store_->snapshot());
}

void Scenario::first_writes() {
  narrator_->chapter(
      "2", "First writes",
      {"Each put does two things: it appends a record to the WAL and forces it to disk, then stores the key in the "
       "memtable, an in-memory table of recent writes. The memtable entry is marked dirty, meaning its newest value "
       "so far exists only in the WAL."});
  put("iphone11", lsm::Value::number(4.8));
  put("iphone12", lsm::Value::number(4.7));
  put("macbook", lsm::Value::number(4.9));

  narrator_->explain(
      {"Here is the first WAL record, byte by byte. The checksum lets recovery detect a record that was only partly "
       "written when a crash happened; the length says where the next record starts."});
  const lsm::Bytes wal_bytes = read_file(data_directory_ / store_->snapshot().active_wal.name);
  printer_->print_wal_record(lsm::slice(wal_bytes, 0, 8 + lsm::read_u32_be(wal_bytes, 4)));
  printer_->print_snapshot(store_->snapshot());
}

void Scenario::values_without_a_schema() {
  narrator_->chapter(
      "3", "Values without a schema",
      {"Values carry their own type, so a key can switch from a number to a string. The update is appended to the "
       "WAL as a second macbook record; the first one is left untouched. The memtable, being a map, keeps only the "
       "newest value."});
  put("macbook", lsm::Value::string("Apple"));
  printer_->print_snapshot(store_->snapshot());

  narrator_->explain(
      {"The next write pushes the WAL past its size limit, so the store flushes: it sorts the dirty entries by key, "
       "writes them to a new SSTable (a sorted, immutable file), marks them clean, starts a new WAL and deletes the "
       "old one. Clean entries stay in memory as a cache."});
  put("ipad", lsm::Value::number(4.6));
  printer_->print_snapshot(store_->snapshot());
}

void Scenario::inside_the_first_sstable() {
  narrator_->chapter(
      "4", "Inside the first SSTable",
      {"The table holds one entry per key, sorted by the bytes of the key, which is why ipad comes before iphone11. "
       "The stale macbook = 4.9 never reached it: only the memtable's newest value was written.",
       "Entries are packed into blocks of at most 64 bytes. The sparse index stores the first key and offset of each "
       "block, so a lookup reads exactly one block. The Bloom filter is a small bit array that can prove a key is "
       "absent without reading the disk at all."});
  printer_->print_snapshot(store_->snapshot());
}

void Scenario::reads_served_from_memory() {
  narrator_->chapter(
      "5", "Reads served from memory",
      {"A read checks the memtable first. Both keys are there as clean entries, so they are answered from memory "
       "with no disk access. Anything in the memtable is the newest value, because every write passes through it."});
  get("macbook");
  get("iphone11");
}

void Scenario::filling_the_cache() {
  narrator_->chapter(
      "6", "Filling the cache",
      {"The memtable has room for 6 entries. When a new key arrives and it is full, the eviction policy (least "
       "recently used here) removes a clean entry, one already saved in an SSTable. Dirty entries are never evicted: "
       "their newest value exists only in the WAL, so dropping them would make reads return stale data.",
       "Watch the eviction lines below, and the second flush when the WAL fills up again."});
  put("airpods", lsm::Value::number(4.5));
  put("watch", lsm::Value::number(4.4));
  put("pixel8", lsm::Value::number(4.3));
  put("galaxy", lsm::Value::number(4.2));
  put("kindle", lsm::Value::number(4.1));
  put("iphone12", lsm::Value::number(4.9));
  put("airpods", lsm::Value::boolean(true));
  put("ipad", lsm::Value::string("M4"));
  put("macbook", lsm::Value::string("M4 Pro"));
  printer_->print_snapshot(store_->snapshot());
}

void Scenario::reads_that_reach_the_disk() {
  narrator_->chapter(
      "7", "Reads that reach the disk",
      {"watch was evicted from the memtable, so its read goes to disk. Tables are checked newest first, and the first "
       "match wins, which guarantees the newest value. For each table the Bloom filter is asked first; only on a "
       "\"maybe\" does the sparse index pick one block to read. A value found on disk is cached as a clean entry."});
  get("watch");

  narrator_->explain({std::string(kAbsentKey) +
                      " was never written. Every table's Bloom filter rules it out, so the read finishes without "
                      "touching the disk."});
  get(kAbsentKey);

  narrator_->explain({std::string(kFalsePositiveProbe) +
                      " was never written either, but in one table all of its Bloom filter bits happen to be set by "
                      "other keys. That \"maybe\" is a false positive: it costs one block read before the read moves "
                      "on."});
  get(kFalsePositiveProbe);
}

void Scenario::deleting_a_key() {
  narrator_->chapter(
      "8", "Deleting a key",
      {"SSTables are immutable, so a delete can't remove watch from the table that holds it. Instead it writes a "
       "tombstone: an entry that means \"deleted\". The read finds the tombstone in the memtable first and reports "
       "the key as absent, so the older value on disk is never consulted."});
  remove("watch");
  get("watch");
  printer_->print_snapshot(store_->snapshot());
}

void Scenario::compaction() {
  narrator_->chapter(
      "9", "Compaction",
      {"Every flush adds a table, and the same key can live in several of them. When the table count reaches 3, the "
       "compactor merges the two oldest tables like merge sort: two pointers walk both sorted tables, and on equal "
       "keys the newer entry wins. The output is named by the range of WAL numbers it covers, so it still sorts as "
       "older than the tables it didn't absorb.",
       "A tombstone may be dropped only when the merge includes the oldest table, because then no older copy of the "
       "key can exist anywhere. The next write triggers a flush and the first merge."});
  put("pixel8", lsm::Value::number(4.4));

  narrator_->explain(
      {"Five more writes fill the WAL again. This time the merge includes the table holding the watch tombstone "
       "together with the oldest data, so both the old watch = 4.4 and its tombstone disappear for good."});
  put("kindle", lsm::Value::string("Paperwhite"));
  put("galaxy", lsm::Value::boolean(false));
  put("iphone11", lsm::Value::number(4.7));
  put("airpods", lsm::Value::number(4.6));
  put("ipad", lsm::Value::number(4.5));
  printer_->print_snapshot(store_->snapshot());
  get("watch");
}

void Scenario::crash_and_recovery() {
  narrator_->chapter(
      "10", "Crash and recovery",
      {"Two more writes, then the process \"crashes\": the store is abandoned without being closed, and 5 bytes of a "
       "half-written record are appended to the WAL, as if power failed in the middle of a write."});
  put("galaxy", lsm::Value::number(4.3));
  put("kindle", lsm::Value::number(4.2));
  const std::string wal_name = store_->snapshot().active_wal.name;
  append_to_file(data_directory_ / wal_name, lsm::Bytes{0x00, 0x00, 0x00, 0x2a, 0x00});
  // Dropped without close(): nothing is flushed or logged, exactly as if the process had died.
  store_.reset();

  narrator_->explain(
      {"A new store opens the same directory. Recovery removes unfinished temporary files, opens the tables, and "
       "replays the WAL. The torn record fails its checksum check, so the WAL is truncated just before it; that "
       "write was never acknowledged, so nothing promised is lost. The memtable comes back with only the dirty "
       "entries; the cache refills as keys are read."});
  store_ = open_store_();
  printer_->print_snapshot(store_->snapshot());
  get("galaxy");
  get("macbook");
  get("watch");
}

void Scenario::summary() {
  narrator_->chapter(
      "—", "Summary",
      {"Fast writes: every write is one sequential WAL append plus one memory update; sorting, flushing and merging "
       "happen later, in bulk.",
       "Fast reads: recent and popular keys come from the memtable; otherwise each table costs a Bloom filter check "
       "in memory and at most one block read.",
       "Durability: the WAL is forced to disk before a write returns, tables are published by atomic rename, and "
       "recovery repairs torn writes.",
       "Unstructured values: every value carries its own type and length.",
       "Scale: data lives in immutable SSTables that can be copied to and spread across machines, with only a few "
       "bits per key and one index entry per block kept in memory."});
  store_->close();
}

void Scenario::put(const std::string& key, const lsm::Value& value) {
  narrator_->operation("put " + key + " = " + value.display());
  store_->put(key, value);
}

void Scenario::remove(const std::string& key) {
  narrator_->operation("delete " + key);
  store_->remove(key);
}

void Scenario::get(const std::string& key) {
  narrator_->operation("get " + key);
  const std::optional<lsm::Value> value = store_->get(key);
  narrator_->result(value ? value->display() : "not found");
}

}  // namespace demo
