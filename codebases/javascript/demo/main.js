import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfig, DEMO_CONFIG } from '../lsm/config/storeConfig.js';
import { ConsoleLogger } from '../lsm/logging/consoleLogger.js';
import { StoreFactory } from '../lsm/store/storeFactory.js';
import { Narrator } from './narrator.js';
import { Scenario } from './scenario.js';
import { StatePrinter } from './statePrinter.js';

const dataDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
fs.rmSync(dataDirectory, { recursive: true, force: true });

const config = createConfig(DEMO_CONFIG);
const logger = new ConsoleLogger(config.logLevel);
const narrator = new Narrator();

new Scenario({
  openStore: () => {
    const store = StoreFactory.create(config, logger, dataDirectory);
    store.open();
    return store;
  },
  narrator,
  printer: new StatePrinter(narrator),
  dataDirectory,
}).run();
