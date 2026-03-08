import { createLogger, format, transports } from "winston"
import path from "path"
import { Config } from "./config"

const logsDir = path.join(__dirname, "../../logs")

const { combine, timestamp, colorize, printf, json, errors } = format

// ─── Console format (dev) ─────────────────────────────────────────────────────
const devFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) =>
    stack ? `[${ts}] ${level}: ${message}\n${stack}` : `[${ts}] ${level}: ${message}`,
  ),
)

// ─── File format (JSON, structured) ───────────────────────────────────────────
const fileFormat = combine(timestamp(), errors({ stack: true }), json())

// ─── Logger ───────────────────────────────────────────────────────────────────
const logger = createLogger({
  level: Config.NODE_ENV === "production" ? "warn" : "debug",
  transports: [
    // Console — dev only
    ...(Config.NODE_ENV !== "production" ? [new transports.Console({ format: devFormat })] : []),

    // logs/error.log — errors only
    new transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      format: fileFormat,
    }),

    // logs/combined.log — everything
    new transports.File({
      filename: path.join(logsDir, "combined.log"),
      format: fileFormat,
    }),
  ],
})

export default logger
