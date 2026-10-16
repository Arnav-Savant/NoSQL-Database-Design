#include <exception>
#include <filesystem>
#include <iostream>
#include <memory>

#include "demo/narrator.h"
#include "demo/scenario.h"
#include "demo/state_printer.h"
#include "lsm/config/store_config.h"
#include "lsm/logging/console_logger.h"
#include "lsm/store/store_factory.h"

int main() {
  try {
    // Relative to the working directory: run the demo from codebases/cpp.
    const std::filesystem::path data_directory = "data";
    std::filesystem::remove_all(data_directory);

    const lsm::StoreConfig config = lsm::create_config(lsm::kDemoConfig);
    const auto logger = std::make_shared<lsm::ConsoleLogger>(config.log_level);
    const auto narrator = std::make_shared<const demo::Narrator>();

    demo::Scenario scenario(
        [&] {
          auto store = lsm::StoreFactory::create(config, logger, data_directory);
          store->open();
          return store;
        },
        narrator, std::make_shared<const demo::StatePrinter>(narrator), data_directory);
    scenario.run();
    return 0;
  } catch (const std::exception& error) {
    std::cout.flush();
    std::cerr << "demo failed: " << error.what() << '\n';
    return 1;
  }
}
