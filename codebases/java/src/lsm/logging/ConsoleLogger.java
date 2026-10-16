package lsm.logging;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.regex.Pattern;

/** Writes `[LEVEL] [Component  ] message  key=value` lines to stdout. */
public final class ConsoleLogger implements Logger {
    private static final int LEVEL_WIDTH = 5;
    private static final int COMPONENT_WIDTH = 11;
    private static final Pattern WHITESPACE = Pattern.compile("\\s");

    private final LogLevel threshold;
    private final Consumer<String> output;

    public ConsoleLogger(LogLevel threshold) {
        this(threshold, line -> {
            System.out.print(line + "\n");
            System.out.flush();
        });
    }

    public ConsoleLogger(LogLevel threshold, Consumer<String> output) {
        this.threshold = threshold;
        this.output = output;
    }

    @Override
    public void write(LogLevel level, String component, String message, Map<String, Object> fields) {
        if (level.severity() < threshold.severity()) return;
        String prefix = "[" + padEnd(level.name(), LEVEL_WIDTH) + "] [" + padEnd(component, COMPONENT_WIDTH) + "] " + message;
        List<String> renderedFields = new ArrayList<>();
        fields.forEach((key, value) -> renderedFields.add(key + "=" + renderFieldValue(value)));
        output.accept(renderedFields.isEmpty() ? prefix : prefix + "  " + String.join(" ", renderedFields));
    }

    private static String renderFieldValue(Object value) {
        String text = String.valueOf(value);
        boolean alreadyQuoted = text.length() >= 2 && text.startsWith("\"") && text.endsWith("\"");
        return WHITESPACE.matcher(text).find() && !alreadyQuoted ? "\"" + text + "\"" : text;
    }

    private static String padEnd(String text, int width) {
        return text.length() >= width ? text : text + " ".repeat(width - text.length());
    }
}
