import math
from dataclasses import dataclass
from decimal import Decimal
from enum import IntEnum


class ValueType(IntEnum):
    """Type tag stored in front of every value; the numbers are part of the on-disk format."""

    NULL = 0
    BOOLEAN = 1
    NUMBER = 2
    STRING = 3
    TOMBSTONE = 4


_TYPE_NAMES = ("null", "boolean", "number", "string", "tombstone")

RawValue = None | bool | int | float | str


@dataclass(frozen=True)
class Value:
    """A self-describing value: its type travels with it, so no schema is needed."""

    type: ValueType
    data: RawValue

    @staticmethod
    def null() -> "Value":
        return Value(ValueType.NULL, None)

    @staticmethod
    def boolean(flag: bool) -> "Value":
        return Value(ValueType.BOOLEAN, bool(flag))

    @staticmethod
    def number(number: float) -> "Value":
        if not math.isfinite(number):
            raise ValueError(f"Only finite numbers can be stored, got {number}.")
        return Value(ValueType.NUMBER, float(number))

    @staticmethod
    def string(text: str) -> "Value":
        return Value(ValueType.STRING, str(text))

    @staticmethod
    def tombstone() -> "Value":
        return Value(ValueType.TOMBSTONE, None)

    @staticmethod
    def from_raw(raw: RawValue) -> "Value":
        if raw is None:
            return Value.null()
        # bool is a subclass of int, so it has to be checked first.
        if isinstance(raw, bool):
            return Value.boolean(raw)
        if isinstance(raw, (int, float)):
            return Value.number(raw)
        if isinstance(raw, str):
            return Value.string(raw)
        raise TypeError(f'Unsupported value type "{type(raw).__name__}". Use None, bool, int, float or str.')

    @property
    def type_name(self) -> str:
        return _TYPE_NAMES[self.type]

    @property
    def display(self) -> str:
        match self.type:
            case ValueType.NULL:
                return "null"
            case ValueType.BOOLEAN:
                return "true" if self.data else "false"
            case ValueType.NUMBER:
                return _format_number(float(self.data))
            case ValueType.STRING:
                return f'"{self.data}"'
            case _:
                return "<tombstone>"


# NOTE: the four language ports must print numbers identically, so integers drop the decimal
# point and everything else uses the shortest representation that round-trips.
def _format_number(number: float) -> str:
    if number.is_integer() and abs(number) < 1e21:
        return str(int(number))
    # repr gives the shortest round-trip digits; they are laid out by JavaScript's Number#toString
    # rules so that exponents switch on at the same magnitudes in every port.
    sign = "-" if number < 0 else ""
    _, digit_tuple, exponent = Decimal(repr(abs(number))).as_tuple()
    digits = "".join(map(str, digit_tuple)).rstrip("0") or "0"
    point = len(digit_tuple) + exponent
    if len(digits) <= point <= 21:
        return sign + digits + "0" * (point - len(digits))
    if 0 < point <= 21:
        return f"{sign}{digits[:point]}.{digits[point:]}"
    if -6 < point <= 0:
        return f"{sign}0.{'0' * -point}{digits}"
    mantissa = digits[0] + (f".{digits[1:]}" if len(digits) > 1 else "")
    return f"{sign}{mantissa}e{'+' if point - 1 >= 0 else '-'}{abs(point - 1)}"
