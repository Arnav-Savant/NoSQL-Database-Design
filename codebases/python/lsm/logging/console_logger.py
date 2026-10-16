import re
import sys
from collections.abc import Callable
from typing import Any

from lsm.logging.logger import Fields, Logger, LogLevel

LEVEL_WIDTH = 5
COMPONENT_WIDTH = 11


def _write_to_stdout(line: str) -> None:
    sys.stdout.write(f"{line}\n")


class ConsoleLogger(Logger):
    """Writes `[LEVEL] [Component  ] message  key=value` lines to stdout."""

    def __init__(self, level: str = "info", output: Callable[[str], None] = _write_to_stdout) -> None:
        threshold = LogLevel.get(level.upper())
        if threshold is None:
            raise ValueError(f'Unknown log level "{level}". Use debug, info, warn or error.')
        self._threshold = threshold
        self._output = output

    def write(self, level: str, component: str, message: str, fields: Fields) -> None:
        if LogLevel[level] < self._threshold:
            return
        prefix = f"[{level.ljust(LEVEL_WIDTH)}] [{component.ljust(COMPONENT_WIDTH)}] {message}"
        rendered_fields = [f"{key}={_render_field_value(value)}" for key, value in fields.items()]
        self._output(f"{prefix}  {' '.join(rendered_fields)}" if rendered_fields else prefix)


def _render_field_value(value: Any) -> str:
    text = _to_text(value)
    already_quoted = len(text) >= 2 and text.startswith('"') and text.endswith('"')
    return f'"{text}"' if re.search(r"\s", text) and not already_quoted else text


# Every port prints the same lines, so booleans and whole numbers render the way JavaScript does.
def _to_text(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)
