#pragma once

#include <filesystem>
#include <memory>

#include "lsm/config/store_config.h"
#include "lsm/logging/logger.h"
#include "lsm/store/lsm_store.h"

namespace lsm {

/// The one place where concrete implementations are chosen and wired together.
class StoreFactory {
 public:
  static std::unique_ptr<LsmStore> create(const StoreConfig& config, std::shared_ptr<Logger> logger,
                                          const std::filesystem::path& data_directory);
};

}  // namespace lsm
