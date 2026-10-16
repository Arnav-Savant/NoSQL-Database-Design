#include "lsm/logging/console_logger.h"

#include <algorithm>
#include <cctype>
#include <iostream>
#include <stdexcept>

namespace lsm {
namespace {

constexpr std::size_t kLevelWidth = 5;
constexpr std::size_t kComponentWidth = 11;

std::string pad_end(const std::string& text, std::size_t width) {
  return text.size() >= width ? text : text + std::string(width - text.size(), ' ');
}

LogLevel parse_level(const std::string& level) {
  std::string upper = level;
  std::transform(upper.begin(), upper.end(), upper.begin(), [](unsigned char c) { return std::toupper(c); });
  if (upper == "DEBUG") return LogLevel::kDebug;
  if (upper == "INFO") return LogLevel::kInfo;
  if (upper == "WARN") return LogLevel::kWarn;
  if (upper == "ERROR") return LogLevel::kError;
  throw std::invalid_argument("Unknown log level \"" + level + "\". Use debug, info, warn or error.");
}

std::string render_field_value(const std::string& text) {
  const bool already_quoted = text.size() >= 2 && text.front() == '"' && text.back() == '"';
  const bool has_whitespace =
      std::any_of(text.begin(), text.end(), [](unsigned char c) { return std::isspace(c) != 0; });
  return has_whitespace && !already_quoted ? "\"" + text + "\"" : text;
}

}  // namespace

ConsoleLogger::ConsoleLogger(const std::string& level, Output output)
    : threshold_(parse_level(level)), output_(std::move(output)) {
  if (!output_) output_ = [](const std::string& line) { std::cout << line << '\n'; };
}

void ConsoleLogger::write(LogLevel level, const std::string& component, const std::string& message,
                          const LogFields& fields) {
  if (static_cast<int>(level) < static_cast<int>(threshold_)) return;
  std::string line = "[" + pad_end(log_level_name(level), kLevelWidth) + "] [" + pad_end(component, kComponentWidth) +
                     "] " + message;
  for (std::size_t i = 0; i < fields.size(); ++i) {
    line += i == 0 ? "  " : " ";
    line += fields[i].first + "=" + render_field_value(fields[i].second);
  }
  output_(line);
}

}  // namespace lsm
