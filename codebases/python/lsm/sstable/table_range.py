from dataclasses import dataclass


# A flushed table covers one WAL (`3-3`); a merged table covers its inputs (`1-3`). Ordering tables
# by `max` orders them by the age of their data, which a fresh id after a merge would break.
@dataclass(frozen=True)
class TableRange:
    """The span of WAL sequence numbers whose writes a table holds."""

    min: int
    max: int

    def __post_init__(self) -> None:
        integers = all(isinstance(bound, int) and not isinstance(bound, bool) for bound in (self.min, self.max))
        if not integers or self.min < 1 or self.max < self.min:
            raise ValueError(f"Invalid table range {self.min}-{self.max}.")

    def strictly_contains(self, other: "TableRange") -> bool:
        covers = self.min <= other.min and other.max <= self.max
        return covers and self != other
