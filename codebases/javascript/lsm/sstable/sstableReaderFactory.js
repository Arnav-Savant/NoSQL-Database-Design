import { SSTableReader } from './sstableReader.js';

/** Opens SSTables by file name with the store's shared hasher and logger. */
export class SSTableReaderFactory {
  #directory;
  #hasher;
  #logger;

  constructor(directory, hasher, logger) {
    this.#directory = directory;
    this.#hasher = hasher;
    this.#logger = logger;
  }

  open(name) {
    return SSTableReader.open(this.#directory, name, this.#hasher, this.#logger);
  }
}
