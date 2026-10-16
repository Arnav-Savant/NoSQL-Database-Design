#include "lsm/entry/value.h"

#include <array>
#include <charconv>
#include <cmath>
#include <cstdlib>
#include <stdexcept>
#include <utility>

namespace lsm {
namespace {

constexpr std::array<const char*, 5> kTypeNames{"null", "boolean", "number", "string", "tombstone"};
constexpr double kExponentThreshold = 1e21;

// ECMAScript Number::toString: the shortest round-trip digits, laid out in plain or exponent form.
std::string shortest_number_text(double number) {
  const bool negative = number < 0;
  std::array<char, 64> buffer{};
  const auto result =
      std::to_chars(buffer.data(), buffer.data() + buffer.size(), std::fabs(number), std::chars_format::scientific);
  const std::string text(buffer.data(), result.ptr);

  const std::size_t exponent_mark = text.find('e');
  std::string digits;
  for (std::size_t i = 0; i < exponent_mark; ++i) {
    if (text[i] != '.') digits += text[i];
  }
  const int exponent = std::atoi(text.c_str() + exponent_mark + 1);
  const int digit_count = static_cast<int>(digits.size());
  const int point = exponent + 1;

  std::string out;
  if (digit_count <= point && point <= 21) {
    out = digits + std::string(static_cast<std::size_t>(point - digit_count), '0');
  } else if (0 < point && point <= 21) {
    out = digits.substr(0, static_cast<std::size_t>(point)) + "." + digits.substr(static_cast<std::size_t>(point));
  } else if (-6 < point && point <= 0) {
    out = "0." + std::string(static_cast<std::size_t>(-point), '0') + digits;
  } else {
    const int shown_exponent = point - 1;
    const std::string sign = shown_exponent < 0 ? "-" : "+";
    out = digits.substr(0, 1);
    if (digit_count > 1) out += "." + digits.substr(1);
    out += "e" + sign + std::to_string(std::abs(shown_exponent));
  }
  return negative ? "-" + out : out;
}

}  // namespace

Value::Value(ValueType type, Data data) : type_(type), data_(std::move(data)) {}

Value Value::null() { return Value(ValueType::kNull, std::monostate{}); }

Value Value::boolean(bool flag) { return Value(ValueType::kBoolean, flag); }

Value Value::number(double number) {
  if (!std::isfinite(number)) {
    throw std::invalid_argument("Only finite numbers can be stored, got " + std::to_string(number) + ".");
  }
  return Value(ValueType::kNumber, number);
}

Value Value::string(std::string text) { return Value(ValueType::kString, std::move(text)); }

Value Value::tombstone() { return Value(ValueType::kTombstone, std::monostate{}); }

const char* Value::type_name() const { return kTypeNames[static_cast<std::size_t>(type_)]; }

std::string Value::display() const {
  switch (type_) {
    case ValueType::kNull:
      return "null";
    case ValueType::kBoolean:
      return as_boolean() ? "true" : "false";
    case ValueType::kNumber:
      return format_number(as_number());
    case ValueType::kString:
      return "\"" + as_string() + "\"";
    default:
      return "<tombstone>";
  }
}

// NOTE: the four language ports must print numbers identically, so integers drop the decimal
// point and everything else uses the shortest representation that round-trips.
std::string format_number(double number) {
  if (number == 0) return "0";
  if (std::trunc(number) == number && std::fabs(number) < kExponentThreshold) {
    std::array<char, 64> buffer{};
    const auto result =
        std::to_chars(buffer.data(), buffer.data() + buffer.size(), number, std::chars_format::fixed, 0);
    return std::string(buffer.data(), result.ptr);
  }
  return shortest_number_text(number);
}

}  // namespace lsm
