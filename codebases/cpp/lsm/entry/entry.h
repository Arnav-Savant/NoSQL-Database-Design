#pragma once

#include <stdexcept>
#include <string>
#include <utility>

#include "lsm/entry/value.h"

namespace lsm {

/// One key and its value at a point in time; a delete is an entry whose value is a tombstone.
class Entry {
 public:
  Entry(std::string key, Value value) : key_(std::move(key)), value_(std::move(value)) {
    if (key_.empty()) throw std::invalid_argument("Keys must be non-empty strings.");
  }

  static Entry tombstone(std::string key) { return Entry(std::move(key), Value::tombstone()); }

  const std::string& key() const { return key_; }
  const Value& value() const { return value_; }
  bool is_tombstone() const { return value_.type() == ValueType::kTombstone; }

 private:
  std::string key_;
  Value value_;
};

}  // namespace lsm
