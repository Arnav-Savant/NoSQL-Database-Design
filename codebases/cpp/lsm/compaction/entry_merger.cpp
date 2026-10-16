#include "lsm/compaction/entry_merger.h"

#include "lsm/entry/key_order.h"

namespace lsm {

MergeResult EntryMerger::merge(const std::vector<Entry>& older_entries, const std::vector<Entry>& newer_entries,
                               bool drop_tombstones) const {
  MergeResult result;

  const auto emit = [&](const Entry& entry) {
    if (drop_tombstones && entry.is_tombstone()) {
      ++result.tombstones_dropped;
    } else {
      result.entries.push_back(entry);
    }
  };

  std::size_t older = 0;
  std::size_t newer = 0;
  while (older < older_entries.size() && newer < newer_entries.size()) {
    const int order = compare_keys(older_entries[older].key(), newer_entries[newer].key());
    if (order < 0) {
      emit(older_entries[older++]);
    } else if (order > 0) {
      emit(newer_entries[newer++]);
    } else {
      emit(newer_entries[newer++]);
      ++older;
      ++result.duplicates_dropped;
    }
  }
  while (older < older_entries.size()) emit(older_entries[older++]);
  while (newer < newer_entries.size()) emit(newer_entries[newer++]);

  return result;
}

}  // namespace lsm
