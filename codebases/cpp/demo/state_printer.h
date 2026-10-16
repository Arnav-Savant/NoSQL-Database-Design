#pragma once

#include <memory>

#include "demo/narrator.h"
#include "lsm/io/big_endian.h"
#include "lsm/store/contracts.h"

namespace demo {

/// Renders store snapshots and raw WAL records as aligned text.
class StatePrinter {
 public:
  explicit StatePrinter(std::shared_ptr<const Narrator> narrator);

  void print_snapshot(const lsm::StoreSnapshot& snapshot) const;
  void print_wal_record(const lsm::Bytes& record_bytes) const;

 private:
  std::shared_ptr<const Narrator> narrator_;
};

}  // namespace demo
