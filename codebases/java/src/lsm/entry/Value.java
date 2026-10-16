package lsm.entry;

import java.math.BigDecimal;

/** A self-describing value: its type travels with it, so no schema is needed. */
public record Value(ValueType type, Object data) {
    private static final double PLAIN_INTEGER_LIMIT = 1e21;

    public Value {
        if (type == null) throw new IllegalArgumentException("A value needs a type.");
        boolean consistent = switch (type) {
            case NULL, TOMBSTONE -> data == null;
            case BOOLEAN -> data instanceof Boolean;
            case NUMBER -> data instanceof Double;
            case STRING -> data instanceof String;
        };
        if (!consistent) throw new IllegalArgumentException("Data " + data + " does not match value type " + type.typeName() + ".");
    }

    public static Value ofNull() {
        return new Value(ValueType.NULL, null);
    }

    public static Value ofBoolean(boolean flag) {
        return new Value(ValueType.BOOLEAN, flag);
    }

    public static Value ofNumber(double number) {
        if (!Double.isFinite(number)) throw new IllegalArgumentException("Only finite numbers can be stored, got " + number + ".");
        return new Value(ValueType.NUMBER, number);
    }

    public static Value ofString(String text) {
        return new Value(ValueType.STRING, text);
    }

    public static Value tombstone() {
        return new Value(ValueType.TOMBSTONE, null);
    }

    public static Value from(Object raw) {
        if (raw == null) return ofNull();
        if (raw instanceof Value value) return value;
        if (raw instanceof Boolean flag) return ofBoolean(flag);
        if (raw instanceof Number number) return ofNumber(number.doubleValue());
        if (raw instanceof String text) return ofString(text);
        throw new IllegalArgumentException(
                "Unsupported value type \"" + raw.getClass().getSimpleName() + "\". Use null, boolean, number or string.");
    }

    public String typeName() {
        return type.typeName();
    }

    public String display() {
        return switch (type) {
            case NULL -> "null";
            case BOOLEAN -> (Boolean) data ? "true" : "false";
            case NUMBER -> formatNumber((Double) data);
            case STRING -> "\"" + data + "\"";
            case TOMBSTONE -> "<tombstone>";
        };
    }

    // NOTE: the four language ports must print numbers identically, so integers drop the decimal
    // point and everything else uses the shortest representation that round-trips.
    private static String formatNumber(double number) {
        if (number == Math.rint(number) && Math.abs(number) < PLAIN_INTEGER_LIMIT) {
            return new BigDecimal(number).toPlainString();
        }
        return shortestRoundTrip(number);
    }

    // Double.toString already yields the shortest round-tripping digits (JDK 19+); only the layout
    // differs from JavaScript, which writes plain decimals for exponents -7 to 20.
    private static String shortestRoundTrip(double number) {
        BigDecimal exact = new BigDecimal(Double.toString(Math.abs(number))).stripTrailingZeros();
        String digits = exact.unscaledValue().toString();
        int digitCount = digits.length();
        int pointPosition = digitCount - exact.scale();
        String sign = number < 0 ? "-" : "";

        if (digitCount <= pointPosition && pointPosition <= 21) {
            return sign + digits + "0".repeat(pointPosition - digitCount);
        }
        if (0 < pointPosition && pointPosition <= 21) {
            return sign + digits.substring(0, pointPosition) + "." + digits.substring(pointPosition);
        }
        if (-6 < pointPosition && pointPosition <= 0) {
            return sign + "0." + "0".repeat(-pointPosition) + digits;
        }
        int exponent = pointPosition - 1;
        String exponentText = (exponent < 0 ? "-" : "+") + Math.abs(exponent);
        String mantissa = digitCount == 1 ? digits : digits.charAt(0) + "." + digits.substring(1);
        return sign + mantissa + "e" + exponentText;
    }
}
