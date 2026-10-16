#pragma once

#include <string>
#include <utility>
#include <vector>

namespace lsm {

enum class LogLevel { kDebug = 10, kInfo = 20, kWarn = 30, kError = 40 };

inline const char* log_level_name(LogLevel level) {
  switch (level) {
    case LogLevel::kDebug:
      return "DEBUG";
    case LogLevel::kInfo:
      return "INFO";
    case LogLevel::kWarn:
      return "WARN";
    default:
      return "ERROR";
  }
}

// An ordered list rather than a map, so fields print in the order the caller wrote them.
using LogFields = std::vector<std::pair<std::string, std::string>>;

/// Structured logging contract used by every component.
class Logger {
 public:
  virtual ~Logger() = default;

  void debug(const std::string& component, const std::string& message, const LogFields& fields = {}) {
    write(LogLevel::kDebug, component, message, fields);
  }

  void info(const std::string& component, const std::string& message, const LogFields& fields = {}) {
    write(LogLevel::kInfo, component, message, fields);
  }

  void warn(const std::string& component, const std::string& message, const LogFields& fields = {}) {
    write(LogLevel::kWarn, component, message, fields);
  }

  void error(const std::string& component, const std::string& message, const LogFields& fields = {}) {
    write(LogLevel::kError, component, message, fields);
  }

  virtual void write(LogLevel level, const std::string& component, const std::string& message,
                     const LogFields& fields) = 0;
};

}  // namespace lsm
