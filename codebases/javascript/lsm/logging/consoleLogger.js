import { Logger, LogLevel } from './logger.js';

const LEVEL_WIDTH = 5;
const COMPONENT_WIDTH = 11;

/** Writes `[LEVEL] [Component  ] message  key=value` lines to stdout. */
export class ConsoleLogger extends Logger {
  #threshold;
  #output;

  constructor(level = 'info', output = (line) => process.stdout.write(`${line}\n`)) {
    super();
    const threshold = LogLevel[level.toUpperCase()];
    if (threshold === undefined) throw new Error(`Unknown log level "${level}". Use debug, info, warn or error.`);
    this.#threshold = threshold;
    this.#output = output;
  }

  write(level, component, message, fields) {
    if (LogLevel[level] < this.#threshold) return;
    const prefix = `[${level.padEnd(LEVEL_WIDTH)}] [${component.padEnd(COMPONENT_WIDTH)}] ${message}`;
    const renderedFields = Object.entries(fields).map(([key, value]) => `${key}=${renderFieldValue(value)}`);
    this.#output(renderedFields.length === 0 ? prefix : `${prefix}  ${renderedFields.join(' ')}`);
  }
}

function renderFieldValue(value) {
  const text = String(value);
  const alreadyQuoted = text.length >= 2 && text.startsWith('"') && text.endsWith('"');
  return /\s/.test(text) && !alreadyQuoted ? `"${text}"` : text;
}
