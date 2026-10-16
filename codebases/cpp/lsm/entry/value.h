#pragma once

#include <cstdint>
#include <string>
#include <variant>

namespace lsm {

/// Type tag stored in front of every value; the numbers are part of the on-disk format.
enum class ValueType : std::uint8_t { kNull = 0, kBoolean = 1, kNumber = 2, kString = 3, kTombstone = 4 };

/// A self-describing value: its type travels with it, so no schema is needed.
class Value {
 public:
  using Data = std::variant<std::monostate, bool, double, std::string>;

  static Value null();
  static Value boolean(bool flag);
  static Value number(double number);
  static Value string(std::string text);
  static Value tombstone();

  ValueType type() const { return type_; }
  const Data& data() const { return data_; }
  bool as_boolean() const { return std::get<bool>(data_); }
  double as_number() const { return std::get<double>(data_); }
  const std::string& as_string() const { return std::get<std::string>(data_); }

  const char* type_name() const;
  std::string display() const;

 private:
  Value(ValueType type, Data data);

  ValueType type_;
  Data data_;
};

// Formats a number the way JavaScript prints it, so every port shows the same text.
std::string format_number(double number);

}  // namespace lsm
