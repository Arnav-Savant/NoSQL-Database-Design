package demo;

import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.function.Consumer;
import java.util.stream.Stream;
import lsm.config.StoreConfig;
import lsm.logging.ConsoleLogger;
import lsm.logging.Logger;
import lsm.store.LsmStore;
import lsm.store.StoreFactory;

/** Runs the narrated walkthrough against a fresh `data` directory under the working directory. */
public final class Main {
    private Main() {
    }

    public static void main(String[] args) {
        Path dataDirectory = Path.of("data").toAbsolutePath();
        deleteRecursively(dataDirectory);

        // Stdout is UTF-8 regardless of the platform default, so the em dash prints the same everywhere.
        PrintStream stdout = new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8);
        Consumer<String> output = line -> stdout.print(line + "\n");

        StoreConfig config = StoreConfig.DEMO_CONFIG;
        Logger logger = new ConsoleLogger(config.logLevel(), output);
        Narrator narrator = new Narrator(output);

        new Scenario(
                () -> {
                    LsmStore store = StoreFactory.create(config, logger, dataDirectory);
                    store.open();
                    return store;
                },
                narrator,
                new StatePrinter(narrator),
                dataDirectory).run();
        stdout.flush();
    }

    private static void deleteRecursively(Path root) {
        if (!Files.exists(root)) return;
        try (Stream<Path> paths = Files.walk(root)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.delete(path);
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }
}
