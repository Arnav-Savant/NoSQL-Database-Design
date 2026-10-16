import re
import sys
from collections.abc import Callable, Iterable

LINE_WIDTH = 78


def _write_to_stdout(line: str) -> None:
    sys.stdout.write(f"{line}\n")


class Narrator:
    """Prints chapter headings, explanations and operations in a consistent shape."""

    def __init__(self, output: Callable[[str], None] = _write_to_stdout) -> None:
        self._output = output

    def chapter(self, number: int | str, title: str, paragraphs: Iterable[str]) -> None:
        self._output("")
        self._output(f"== Chapter {number}: {title} ==")
        self.explain(paragraphs)

    def explain(self, paragraphs: Iterable[str]) -> None:
        for paragraph in paragraphs:
            self._output("")
            for line in _wrap(paragraph, LINE_WIDTH):
                self._output(line)

    def operation(self, description: str) -> None:
        self._output("")
        self._output(f"> {description}")

    def result(self, text: str) -> None:
        self._output(f"  result: {text}")

    def line(self, text: str = "") -> None:
        self._output(text)


# Greedy wrapping, word by word, so every port breaks lines at the same places.
def _wrap(text: str, width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in re.split(r"\s+", text):
        if current and len(current) + 1 + len(word) > width:
            lines.append(current)
            current = word
        else:
            current = f"{current} {word}" if current else word
    if current:
        lines.append(current)
    return lines
