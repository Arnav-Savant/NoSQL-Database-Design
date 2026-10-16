from abc import ABC, abstractmethod
from collections.abc import Mapping
from types import MappingProxyType
from typing import Any

LogLevel: Mapping[str, int] = MappingProxyType({"DEBUG": 10, "INFO": 20, "WARN": 30, "ERROR": 40})

Fields = Mapping[str, Any]


class Logger(ABC):
    """Structured logging contract used by every component."""

    def debug(self, component: str, message: str, fields: Fields | None = None) -> None:
        self.write("DEBUG", component, message, fields or {})

    def info(self, component: str, message: str, fields: Fields | None = None) -> None:
        self.write("INFO", component, message, fields or {})

    def warn(self, component: str, message: str, fields: Fields | None = None) -> None:
        self.write("WARN", component, message, fields or {})

    def error(self, component: str, message: str, fields: Fields | None = None) -> None:
        self.write("ERROR", component, message, fields or {})

    @abstractmethod
    def write(self, level: str, component: str, message: str, fields: Fields) -> None: ...
