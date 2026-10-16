import fs from 'node:fs';
import path from 'node:path';
import { TEMP_SUFFIX } from './fileNames.js';

/** All file-system access of the store, by file name inside one data directory. */
export class StorageDirectory {
  #root;

  constructor(root) {
    this.#root = path.resolve(root);
  }

  get root() {
    return this.#root;
  }

  ensureExists() {
    fs.mkdirSync(this.#root, { recursive: true });
  }

  list() {
    return fs.readdirSync(this.#root).sort();
  }

  pathOf(name) {
    return path.join(this.#root, name);
  }

  sizeOf(name) {
    return fs.statSync(this.pathOf(name)).size;
  }

  readAll(name) {
    return fs.readFileSync(this.pathOf(name));
  }

  readRange(name, offset, length) {
    const buffer = Buffer.alloc(length);
    const descriptor = fs.openSync(this.pathOf(name), 'r');
    try {
      const bytesRead = fs.readSync(descriptor, buffer, 0, length, offset);
      if (bytesRead !== length) throw new Error(`Short read in ${name}: wanted ${length} bytes at ${offset}, got ${bytesRead}.`);
      return buffer;
    } finally {
      fs.closeSync(descriptor);
    }
  }

  // A crash can never leave a half-written file under its final name: the bytes go to a
  // temporary file, reach the disk, and only then does an atomic rename publish them.
  writeAtomically(name, bytes) {
    const temporaryName = `${name}${TEMP_SUFFIX}`;
    const descriptor = fs.openSync(this.pathOf(temporaryName), 'w');
    try {
      fs.writeSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(this.pathOf(temporaryName), this.pathOf(name));
    this.#syncDirectory();
  }

  openForAppend(name) {
    const descriptor = fs.openSync(this.pathOf(name), 'a');
    this.#syncDirectory();
    return descriptor;
  }

  appendAndSync(descriptor, bytes) {
    fs.writeSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  }

  closeFile(descriptor) {
    fs.closeSync(descriptor);
  }

  truncate(name, length) {
    fs.truncateSync(this.pathOf(name), length);
  }

  remove(name) {
    fs.rmSync(this.pathOf(name), { force: true });
    this.#syncDirectory();
  }

  // NOTE: syncing the directory makes the creation, rename or deletion of a file itself durable.
  // This works on Linux; some platforms don't allow opening a directory and skip this step.
  #syncDirectory() {
    let descriptor;
    try {
      descriptor = fs.openSync(this.#root, 'r');
      fs.fsyncSync(descriptor);
    } catch {
      // Best effort on platforms without directory fsync.
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }
}
