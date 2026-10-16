package demo;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/** Prints chapter headings, explanations and operations in a consistent shape. */
public final class Narrator {
    private static final int LINE_WIDTH = 78;

    private final Consumer<String> output;

    public Narrator(Consumer<String> output) {
        this.output = output;
    }

    public void chapter(String number, String title, List<String> paragraphs) {
        output.accept("");
        output.accept("== Chapter " + number + ": " + title + " ==");
        explain(paragraphs);
    }

    public void explain(List<String> paragraphs) {
        for (String paragraph : paragraphs) {
            output.accept("");
            for (String line : wrap(paragraph, LINE_WIDTH)) output.accept(line);
        }
    }

    public void operation(String description) {
        output.accept("");
        output.accept("> " + description);
    }

    public void result(String text) {
        output.accept("  result: " + text);
    }

    public void line(String text) {
        output.accept(text);
    }

    private static List<String> wrap(String text, int width) {
        List<String> lines = new ArrayList<>();
        String current = "";
        for (String word : text.split("\\s+")) {
            if (current.length() > 0 && current.length() + 1 + word.length() > width) {
                lines.add(current);
                current = word;
            } else {
                current = current.length() > 0 ? current + " " + word : word;
            }
        }
        if (current.length() > 0) lines.add(current);
        return lines;
    }
}
