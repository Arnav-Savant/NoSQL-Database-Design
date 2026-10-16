import shutil
import sys
from pathlib import Path

from demo.narrator import Narrator
from demo.scenario import Scenario
from demo.state_printer import StatePrinter
from lsm.config.store_config import DEMO_CONFIG, create_config
from lsm.logging.console_logger import ConsoleLogger
from lsm.store.lsm_store import LsmStore
from lsm.store.store_factory import StoreFactory


def main() -> None:
    # The narration contains non-ASCII characters; every port writes them as UTF-8.
    sys.stdout.reconfigure(encoding="utf-8")

    data_directory = Path(__file__).resolve().parent.parent / "data"
    shutil.rmtree(data_directory, ignore_errors=True)

    config = create_config(DEMO_CONFIG)
    logger = ConsoleLogger(config.log_level)
    narrator = Narrator()

    def open_store() -> LsmStore:
        store = StoreFactory.create(config, logger, data_directory)
        store.open()
        return store

    Scenario(
        open_store=open_store,
        narrator=narrator,
        printer=StatePrinter(narrator),
        data_directory=data_directory,
    ).run()


if __name__ == "__main__":
    main()
