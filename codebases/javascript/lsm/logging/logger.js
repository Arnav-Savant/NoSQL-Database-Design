export const LogLevel = Object.freeze({ DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 });

/** Structured logging contract used by every component. */
export class Logger {
  debug(component, message, fields = {}) {
    this.write('DEBUG', component, message, fields);
  }

  info(component, message, fields = {}) {
    this.write('INFO', component, message, fields);
  }

  warn(component, message, fields = {}) {
    this.write('WARN', component, message, fields);
  }

  error(component, message, fields = {}) {
    this.write('ERROR', component, message, fields);
  }

  write(_level, _component, _message, _fields) {
    throw new Error('Logger.write must be implemented');
  }
}
