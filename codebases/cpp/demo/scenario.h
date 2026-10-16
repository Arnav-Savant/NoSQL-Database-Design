#pragma once

#include <filesystem>
#include <functional>
#include <memory>
#include <string>

#include "demo/narrator.h"
#include "demo/state_printer.h"
#include "lsm/entry/value.h"
#include "lsm/store/lsm_store.h"

namespace demo {

// An absent key whose bits all happen to be set in a table's Bloom filter at chapter 7.
inline constexpr const char* kFalsePositiveProbe = "probe-069";
inline constexpr const char* kAbsentKey = "nokia";

/// The ten-chapter walkthrough shared by every language's demo.
class Scenario {
 public:
  using StoreOpener = std::function<std::unique_ptr<lsm::LsmStore>()>;

  Scenario(StoreOpener open_store, std::shared_ptr<const Narrator> narrator, std::shared_ptr<const StatePrinter> printer,
           std::filesystem::path data_directory);

  void run();

 private:
  void opening_an_empty_store();
  void first_writes();
  void values_without_a_schema();
  void inside_the_first_sstable();
  void reads_served_from_memory();
  void filling_the_cache();
  void reads_that_reach_the_disk();
  void deleting_a_key();
  void compaction();
  void crash_and_recovery();
  void summary();

  void put(const std::string& key, const lsm::Value& value);
  void remove(const std::string& key);
  void get(const std::string& key);

  StoreOpener open_store_;
  std::shared_ptr<const Narrator> narrator_;
  std::shared_ptr<const StatePrinter> printer_;
  std::filesystem::path data_directory_;
  std::unique_ptr<lsm::LsmStore> store_;
};

}  // namespace demo
