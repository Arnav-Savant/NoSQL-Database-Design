#include "lsm/compaction/compactor.h"

#include <algorithm>
#include <optional>
#include <string>
#include <utility>

namespace lsm {
namespace {

std::vector<TablePtr> sort_oldest_first(std::vector<TablePtr> tables) {
  std::stable_sort(tables.begin(), tables.end(),
                   [](const TablePtr& left, const TablePtr& right) { return left->range().max() < right->range().max(); });
  return tables;
}

}  // namespace

Compactor::Compactor(std::unique_ptr<CompactionStrategy> strategy, std::unique_ptr<EntryMerger> merger,
                     std::shared_ptr<const SSTableWriter> writer,
                     std::shared_ptr<const SSTableReaderFactory> reader_factory,
                     std::shared_ptr<const StorageDirectory> directory, std::shared_ptr<Logger> logger)
    : strategy_(std::move(strategy)),
      merger_(std::move(merger)),
      writer_(std::move(writer)),
      reader_factory_(std::move(reader_factory)),
      directory_(std::move(directory)),
      logger_(std::move(logger)) {}

std::vector<TablePtr> Compactor::compact_until_stable(const std::vector<TablePtr>& tables) const {
  std::vector<TablePtr> live = sort_oldest_first(tables);
  for (auto inputs = strategy_->select_inputs(live); inputs; inputs = strategy_->select_inputs(live)) {
    const auto [older, newer] = *inputs;
    const TablePtr output = merge(older, newer, live);
    std::vector<TablePtr> remaining;
    for (const TablePtr& table : live) {
      if (table != older && table != newer) remaining.push_back(table);
    }
    if (output) remaining.push_back(output);
    live = sort_oldest_first(std::move(remaining));
  }
  return live;
}

TablePtr Compactor::merge(const TablePtr& older, const TablePtr& newer, const std::vector<TablePtr>& live) const {
  // NOTE: a tombstone may only be dropped when no table older than this merge could still hold
  // the key; otherwise the deleted value would reappear from that older table.
  const bool drop_tombstones = std::all_of(live.begin(), live.end(), [&](const TablePtr& table) {
    return table->range().min() >= older->range().min();
  });
  logger_->info("Compaction", "merging",
                {{"older", older->name()}, {"newer", newer->name()}, {"dropTombstones", drop_tombstones ? "true" : "false"}});

  // NOTE: both tables are loaded whole because they are small here. Real compactors stream
  // through the inputs one entry at a time, so memory use doesn't grow with table size.
  const MergeResult result = merger_->merge(older->read_all_entries(), newer->read_all_entries(), drop_tombstones);
  const TableRange range(older->range().min(), newer->range().max());
  std::optional<std::string> output_name;
  if (!result.entries.empty()) output_name = writer_->write(range, result.entries);

  // The output is fully on disk before the inputs disappear. A crash in between leaves inputs
  // whose ranges sit inside the output's range, which recovery recognises and removes.
  directory_->remove(older->name());
  directory_->remove(newer->name());
  logger_->info("Compaction", "merged",
                {{"output", output_name.value_or("none")},
                 {"kept", std::to_string(result.entries.size())},
                 {"duplicatesDropped", std::to_string(result.duplicates_dropped)},
                 {"tombstonesDropped", std::to_string(result.tombstones_dropped)}});
  return output_name ? reader_factory_->open(*output_name) : nullptr;
}

}  // namespace lsm
