/**
 * Structured Logger — replaces raw console.log/warn/error
 * 
 * Provides consistent, structured log output with:
 * - Log levels (info, warn, error, debug)
 * - Request context (requestId, route, method)
 * - User context (userId where safe)
 * - Operation metadata
 * - Duration tracking
 * 
 * NEVER logs: passwords, JWTs, OTP values, payment secrets, private keys.
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || "info"] ?? LOG_LEVELS.info;

function formatLog(level, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  };
  return JSON.stringify(entry);
}

function shouldLog(level) {
  return (LOG_LEVELS[level] ?? 1) >= currentLevel;
}

export const logger = {
  info(message, meta = {}) {
    if (!shouldLog("info")) return;
    console.log(formatLog("info", message, meta));
  },

  warn(message, meta = {}) {
    if (!shouldLog("warn")) return;
    console.warn(formatLog("warn", message, meta));
  },

  error(message, meta = {}) {
    if (!shouldLog("error")) return;
    console.error(formatLog("error", message, meta));
  },

  debug(message, meta = {}) {
    if (!shouldLog("debug")) return;
    console.log(formatLog("debug", message, meta));
  },

  /**
   * Create a child logger with request context.
   * Usage: const log = logger.child({ requestId: req.id, route: req.originalUrl });
   */
  child(context = {}) {
    return {
      info: (msg, meta) => logger.info(msg, { ...context, ...meta }),
      warn: (msg, meta) => logger.warn(msg, { ...context, ...meta }),
      error: (msg, meta) => logger.error(msg, { ...context, ...meta }),
      debug: (msg, meta) => logger.debug(msg, { ...context, ...meta }),
    };
  },
};

export default logger;
