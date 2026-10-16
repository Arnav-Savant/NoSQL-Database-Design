import { WalWriter } from './walWriter.js';

/** Opens the write-ahead log for a given sequence number, creating the file if needed. */
export class WalWriterFactory {
  #directory;
  #logger;

  constructor(directory, logger) {
    this.#directory = directory;
    this.#logger = logger;
  }

  open(sequence) {
    const writer = new WalWriter(this.#directory, sequence, this.#logger);
    this.#logger.info('Wal', 'opened', { wal: writer.name, walBytes: writer.sizeBytes });
    return writer;
  }
}
