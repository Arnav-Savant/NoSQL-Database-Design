package lsm.io;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.List;
import java.util.stream.Stream;

/** All file-system access of the store, by file name inside one data directory. */
public final class StorageDirectory {
    private final Path root;

    public StorageDirectory(Path root) {
        this.root = root.toAbsolutePath().normalize();
    }

    public Path root() {
        return root;
    }

    public void ensureExists() {
        try {
            Files.createDirectories(root);
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    public List<String> list() {
        try (Stream<Path> children = Files.list(root)) {
            return children.map(child -> child.getFileName().toString()).sorted().toList();
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    public Path pathOf(String name) {
        return root.resolve(name);
    }

    public long sizeOf(String name) {
        try {
            return Files.size(pathOf(name));
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    public byte[] readAll(String name) {
        try {
            return Files.readAllBytes(pathOf(name));
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    public byte[] readRange(String name, long offset, int length) {
        ByteBuffer buffer = ByteBuffer.allocate(length);
        try (FileChannel channel = FileChannel.open(pathOf(name), StandardOpenOption.READ)) {
            while (buffer.hasRemaining()) {
                int read = channel.read(buffer, offset + buffer.position());
                if (read < 0) break;
            }
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
        if (buffer.hasRemaining()) {
            throw new IllegalStateException("Short read in " + name + ": wanted " + length + " bytes at " + offset
                    + ", got " + buffer.position() + ".");
        }
        return buffer.array();
    }

    // A crash can never leave a half-written file under its final name: the bytes go to a
    // temporary file, reach the disk, and only then does an atomic rename publish them.
    public void writeAtomically(String name, byte[] bytes) {
        String temporaryName = name + FileNames.TEMP_SUFFIX;
        try {
            try (FileChannel channel = FileChannel.open(pathOf(temporaryName), StandardOpenOption.CREATE,
                    StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
                writeFully(channel, bytes);
                channel.force(true);
            }
            Files.move(pathOf(temporaryName), pathOf(name), StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
        syncDirectory();
    }

    public FileChannel openForAppend(String name) {
        try {
            FileChannel channel = FileChannel.open(pathOf(name), StandardOpenOption.CREATE,
                    StandardOpenOption.WRITE, StandardOpenOption.APPEND);
            syncDirectory();
            return channel;
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    public void appendAndSync(FileChannel channel, byte[] bytes) {
        try {
            writeFully(channel, bytes);
            channel.force(true);
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    public void closeFile(FileChannel channel) {
        try {
            channel.close();
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    public void truncate(String name, long length) {
        try (FileChannel channel = FileChannel.open(pathOf(name), StandardOpenOption.WRITE)) {
            channel.truncate(length);
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    public void remove(String name) {
        try {
            Files.deleteIfExists(pathOf(name));
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
        syncDirectory();
    }

    private static void writeFully(FileChannel channel, byte[] bytes) throws IOException {
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        while (buffer.hasRemaining()) channel.write(buffer);
    }

    // NOTE: syncing the directory makes the creation, rename or deletion of a file itself durable.
    // This works on Linux; some platforms don't allow opening a directory and skip this step.
    private void syncDirectory() {
        try (FileChannel channel = FileChannel.open(root, StandardOpenOption.READ)) {
            channel.force(true);
        } catch (IOException | UnsupportedOperationException error) {
            // Best effort on platforms without directory fsync.
        }
    }
}
