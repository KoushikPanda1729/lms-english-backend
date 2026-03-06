import "reflect-metadata"
import pg from "pg"
import { DataSource } from "typeorm"
import { fileURLToPath } from "url"
import path from "path"
import { Config } from "./config"

// node-postgres returns `timestamp without time zone` strings without a timezone suffix.
// JavaScript's Date() then interprets them as LOCAL time (IST on this machine) instead of UTC,
// causing all timestamps to appear 5h30m in the past.
// Fix: append 'Z' so JS always treats them as UTC.
pg.types.setTypeParser(1114, (str: string) => new Date(str + "Z")) // timestamp
pg.types.setTypeParser(1184, (str: string) => new Date(str)) // timestamptz (already has tz info)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const AppDataSource = new DataSource({
  type: "postgres",
  host: Config.DB_HOST,
  port: Number(Config.DB_PORT),
  username: Config.DB_USERNAME,
  password: Config.DB_PASSWORD,
  database: Config.DB_NAME,
  entities: [path.join(__dirname, "../entities/**/*.entity.{ts,js}")],
  migrations: [path.join(__dirname, "../migrations/**/*.{ts,js}")],
  synchronize: false,
  logging: ["error"],
})
