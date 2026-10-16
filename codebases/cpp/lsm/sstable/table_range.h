#pragma once

#include <cstdint>
#include <stdexcept>
#include <string>

namespace lsm {

// A flushed table covers one WAL (`3-3`); a merged table covers its inputs (`1-3`). Ordering tables
// by `max` orders them by the age of their data, which a fresh id after a merge would break.
/// The span of WAL sequence numbers whose writes a table holds.
class TableRange {
 public:
  TableRange(std::uint64_t min, std::uint64_t max) : min_(min), max_(max) {
    if (min < 1 || max < min) {
      throw std::invalid_argument("Invalid table range " + std::to_string(min) + "-" + std::to_string(max) + ".");
    }
  }

  std::uint64_t min() const { return min_; }
  std::uint64_t max() const { return max_; }

  bool strictly_contains(const TableRange& other) const {
    const bool covers = min_ <= other.min_ && other.max_ <= max_;
    return covers && !(min_ == other.min_ && max_ == other.max_);
  }

 private:
  std::uint64_t min_;
  std::uint64_t max_;
};

}  // namespace lsm
