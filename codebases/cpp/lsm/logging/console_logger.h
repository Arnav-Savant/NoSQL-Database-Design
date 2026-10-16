#pragma once

#include <functional>
#include <string>

#include "lsm/logging/logger.h"

namespace lsm {

/// Writes `[LEVEL] [Component  ] message  key=value` lines to stdout.
class ConsoleLogger : public Logger {
 public:
  using Output = std::function<void(const std::string&)>;

  explicit ConsoleLogger(const std::string& level = "info", Output output = nullptr);

  void write(LogLevel level, const std::string& component, const std::string& message,
             const LogFields& fields) override;

 private:
  LogLevel threshold_;
  Output output_;
};

}  // namespace lsm
